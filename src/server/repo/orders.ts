import "server-only";
import { site } from "@/config/site";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  isOrderStatus,
  isPaymentStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/catalog";
import { orderTotals } from "@/lib/pricing";
import type { Order, OrderItem, OrderSummary } from "@/lib/types";
import { getDb, isConstraintError, type InStatement, type InValue, type Row } from "../db";
import { newId, newOrderCode, newToken } from "../ids";
import { findCartProducts } from "./products";

const MAX_LINES = 50;

export type OrderLineInput = { productId: string; quantity: number; expectedPrice: number };

export type OrderDraft = {
  userId: string | null;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
  items: OrderLineInput[];
};

export type CartIssue = {
  productId: string;
  name: string | null;
  reason: "unavailable" | "insufficient_stock" | "price_changed";
};

export type CreateOrderResult =
  | { ok: true; order: { id: string; code: string; token: string; total: number } }
  | { ok: false; reason: "empty" | "cart_changed"; issues: CartIssue[] };

function toOrderBase(row: Row): Omit<Order, "items"> {
  const status = String(row.status);
  const paymentStatus = String(row.payment_status);
  return {
    id: String(row.id),
    code: String(row.code),
    token: String(row.token),
    userId: row.user_id === null ? null : String(row.user_id),
    status: isOrderStatus(status) ? status : "pending",
    paymentMethod: row.payment_method === "bank" ? "bank" : "cod",
    paymentStatus: isPaymentStatus(paymentStatus) ? paymentStatus : "unpaid",
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone),
    customerEmail: String(row.customer_email),
    shippingAddress: String(row.shipping_address),
    shippingCity: String(row.shipping_city),
    note: String(row.note),
    subtotal: Number(row.subtotal),
    shippingFee: Number(row.shipping_fee),
    total: Number(row.total),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toOrderItem(row: Row): OrderItem {
  return {
    productId: String(row.product_id),
    name: String(row.product_name),
    slug: String(row.product_slug),
    image: row.product_image === null ? null : String(row.product_image),
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
  };
}

function toOrderSummary(row: Row): OrderSummary {
  return { ...toOrderBase(row), itemCount: Number(row.item_count) };
}

// Gộp các dòng trùng sản phẩm và loại bỏ số lượng không hợp lệ.
function normalizeLines(items: readonly OrderLineInput[]): OrderLineInput[] {
  const merged = new Map<string, OrderLineInput>();
  for (const item of items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0) continue;
    const existing = merged.get(item.productId);
    if (existing) existing.quantity += item.quantity;
    else merged.set(item.productId, { ...item });
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

// Tạo đơn hàng từ giỏ. Giá và tồn kho luôn lấy từ CSDL, không tin số liệu do trình duyệt gửi lên:
// `expectedPrice` chỉ dùng để phát hiện giá đã đổi so với lúc khách xem giỏ.
export async function createOrder(draft: OrderDraft): Promise<CreateOrderResult> {
  const lines = normalizeLines(draft.items);
  if (lines.length === 0) return { ok: false, reason: "empty", issues: [] };

  const inspect = async () => {
    const products = new Map((await findCartProducts(lines.map((l) => l.productId))).map((p) => [p.id, p]));
    const issues: CartIssue[] = [];
    for (const line of lines) {
      const product = products.get(line.productId);
      if (!product || !product.available) {
        issues.push({ productId: line.productId, name: product?.name ?? null, reason: "unavailable" });
      } else if (line.quantity > Math.min(product.stock, site.maxQtyPerItem)) {
        issues.push({ productId: line.productId, name: product.name, reason: "insufficient_stock" });
      } else if (product.price !== line.expectedPrice) {
        issues.push({ productId: line.productId, name: product.name, reason: "price_changed" });
      }
    }
    return { products, issues };
  };

  const { products, issues } = await inspect();
  if (issues.length > 0) return { ok: false, reason: "cart_changed", issues };

  // Cập nhật sản phẩm theo cùng một thứ tự ở mọi đơn để hai đơn đặt chéo nhau không khoá chết lẫn nhau.
  const priced = lines
    .map((line) => ({ ...line, product: products.get(line.productId)! }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
  const totals = orderTotals(priced.map((l) => ({ price: l.product.price, quantity: l.quantity })));
  const db = await getDb();

  for (let attempt = 0; attempt < 3; attempt++) {
    const order = { id: newId(), code: newOrderCode(), token: newToken(24), total: totals.total };
    const now = Date.now();
    const statements: InStatement[] = [
      {
        sql: `INSERT INTO orders (
                id, code, token, user_id, status, payment_method, payment_status,
                customer_name, customer_phone, customer_email, shipping_address, shipping_city, note,
                subtotal, shipping_fee, total, created_at, updated_at
              ) VALUES (?, ?, ?, ?, 'pending', ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id,
          order.code,
          order.token,
          draft.userId,
          draft.paymentMethod,
          draft.customerName,
          draft.customerPhone,
          draft.customerEmail,
          draft.shippingAddress,
          draft.shippingCity,
          draft.note,
          totals.subtotal,
          totals.shipping,
          totals.total,
          now,
          now,
        ],
      },
    ];
    for (const line of priced) {
      statements.push(
        {
          // Nếu sản phẩm vừa bị ẩn hoặc đổi giá, truy vấn con trả về NULL và vi phạm NOT NULL,
          // khiến cả lô (kể cả đơn hàng) bị huỷ.
          sql: `INSERT INTO order_items (order_id, product_id, product_name, product_slug, product_image, unit_price, quantity)
                VALUES (?, ?, (SELECT name FROM products WHERE id = ? AND is_active = 1 AND price = ?), ?, ?, ?, ?)`,
          args: [
            order.id,
            line.productId,
            line.productId,
            line.product.price,
            line.product.slug,
            line.product.image,
            line.product.price,
            line.quantity,
          ],
        },
        {
          // Ràng buộc CHECK (stock >= 0) của PostgreSQL chặn bán quá số lượng tồn khi hai khách đặt cùng lúc.
          sql: "UPDATE products SET stock = stock - ?, sold = sold + ?, updated_at = ? WHERE id = ?",
          args: [line.quantity, line.quantity, now, line.productId],
        },
      );
    }

    try {
      await db.batch(statements);
      return { ok: true, order };
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      // Trùng mã đơn hoặc token (cực hiếm): sinh mã khác rồi thử lại.
      if (error.statementIndex === 0) continue;
      const recheck = await inspect();
      return { ok: false, reason: "cart_changed", issues: recheck.issues };
    }
  }
  throw new Error("Không tạo được mã đơn hàng duy nhất");
}

async function loadOrder(where: string, arg: InValue): Promise<Order | null> {
  const db = await getDb();
  const result = await db.execute({ sql: `SELECT * FROM orders WHERE ${where}`, args: [arg] });
  const row = result.rows[0];
  if (!row) return null;
  const items = await db.execute({
    sql: "SELECT * FROM order_items WHERE order_id = ? ORDER BY id",
    args: [String(row.id)],
  });
  return { ...toOrderBase(row), items: items.rows.map(toOrderItem) };
}

export function findOrderByToken(token: string): Promise<Order | null> {
  return loadOrder("token = ?", token);
}

export function findOrderById(id: string): Promise<Order | null> {
  return loadOrder("id = ?", id);
}

// Tra cứu đơn cho khách không đăng nhập: phải khớp cả mã đơn lẫn số điện thoại đặt hàng.
export async function findOrderTokenByCodeAndPhone(code: string, phone: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT token FROM orders WHERE code = ? AND customer_phone = ?",
    args: [code, phone],
  });
  return result.rows[0] ? String(result.rows[0].token) : null;
}

const SUMMARY_SQL = `SELECT o.*, (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id) AS item_count
                     FROM orders o`;

export async function listOrdersByUser(userId: string): Promise<OrderSummary[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `${SUMMARY_SQL} WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 100`,
    args: [userId],
  });
  return result.rows.map(toOrderSummary);
}

export async function listOrders(query: {
  status?: OrderStatus;
  // Mã đơn khớp chính xác (nội dung chuyển khoản của khách chính là mã này).
  code?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: OrderSummary[]; total: number }> {
  const filters = [
    ["o.status = ?", query.status],
    ["o.code = ?", query.code],
    ["o.user_id = ?", query.userId],
  ].filter((filter): filter is [string, string] => Boolean(filter[1]));
  const where = filters.length ? `WHERE ${filters.map(([sql]) => sql).join(" AND ")}` : "";
  const args: InValue[] = filters.map(([, value]) => value);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      { sql: `SELECT COUNT(*) AS total FROM orders o ${where}`, args },
      {
        sql: `${SUMMARY_SQL} ${where} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      },
    ]
  );
  return { items: rows.rows.map(toOrderSummary), total: Number(count.rows[0].total) };
}

export type OrderStats = {
  byStatus: Record<OrderStatus, number>;
  totalOrders: number;
  // Doanh thu chỉ tính các đơn đã hoàn tất.
  revenue: number;
  lowStock: { id: string; name: string; stock: number }[];
};

export async function getOrderStats(): Promise<OrderStats> {
  const db = await getDb();
  const [statuses, revenue, lowStock] = await db.batch(
    [
      "SELECT status, COUNT(*) AS total FROM orders GROUP BY status",
      "SELECT COALESCE(SUM(total), 0) AS revenue FROM orders WHERE status = 'completed'",
      "SELECT id, name, stock FROM products WHERE is_active = 1 AND stock <= 5 ORDER BY stock, name LIMIT 10",
    ]
  );
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  for (const row of statuses.rows) {
    const status = String(row.status);
    if (isOrderStatus(status)) byStatus[status] = Number(row.total);
  }
  return {
    byStatus,
    totalOrders: Object.values(byStatus).reduce((a, b) => a + b, 0),
    revenue: Number(revenue.rows[0].revenue),
    lowStock: lowStock.rows.map((row) => ({ id: String(row.id), name: String(row.name), stock: Number(row.stock) })),
  };
}

const placeholders = (values: readonly unknown[]) => values.map(() => "?").join(", ");

// Chuyển đơn sang trạng thái kế tiếp (không dùng cho huỷ đơn). Điều kiện trạng thái hiện tại nằm ngay
// trong câu UPDATE nên hai quản trị viên bấm cùng lúc cũng không thể nhảy sai bước.
export async function advanceOrder(id: string, to: Exclude<OrderStatus, "cancelled" | "pending">): Promise<boolean> {
  const from = ORDER_STATUSES.filter((s) => ORDER_TRANSITIONS[s].includes(to));
  if (from.length === 0) return false;
  const db = await getDb();
  const result = await db.execute({
    // Đơn COD coi như đã thu tiền khi giao hàng hoàn tất.
    sql: `UPDATE orders SET
            status = ?,
            payment_status = CASE WHEN ? = 'completed' AND payment_method = 'cod' AND payment_status = 'unpaid'
                                  THEN 'paid' ELSE payment_status END,
            updated_at = ?
          WHERE id = ? AND status IN (${placeholders(from)})`,
    args: [to, to, Date.now(), id, ...from],
  });
  return result.rowsAffected > 0;
}

// Huỷ đơn và trả hàng về kho trong cùng một giao dịch. Lệnh hoàn kho chạy TRƯỚC và chỉ khi đơn còn ở
// trạng thái cho phép, nên huỷ hai lần cũng không cộng kho hai lần.
export async function cancelOrder(id: string, allowedFrom: readonly OrderStatus[]): Promise<boolean> {
  const from = allowedFrom.filter((s) => ORDER_TRANSITIONS[s].includes("cancelled"));
  if (from.length === 0) return false;
  const db = await getDb();
  const now = Date.now();
  const quantity = "(SELECT COALESCE(SUM(quantity), 0)::int FROM order_items WHERE order_id = ? AND product_id = products.id)";
  const [, , updated] = await db.batch(
    [
      // Khoá dòng đơn hàng: lần huỷ đến sau phải chờ, rồi thấy đơn đã huỷ và không hoàn kho nữa.
      { sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [id] },
      {
        sql: `UPDATE products SET
                stock = stock + ${quantity},
                sold = GREATEST(0, sold - ${quantity}),
                updated_at = ?
              WHERE id IN (SELECT product_id FROM order_items WHERE order_id = ?)
                AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status IN (${placeholders(from)}))`,
        args: [id, id, now, id, id, ...from],
      },
      {
        sql: `UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status IN (${placeholders(from)})`,
        args: [now, id, ...from],
      },
    ]
  );
  return updated.rowsAffected > 0;
}

export async function setPaymentStatus(id: string, status: PaymentStatus): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: "UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?",
    args: [status, Date.now(), id],
  });
  return result.rowsAffected > 0;
}
