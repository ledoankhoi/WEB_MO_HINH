import "server-only";
import { site } from "@/config/site";
import {
  ORDER_STATUSES,
  isOrderStatus,
  isPaymentStatus,
  isShippingStatus,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type ShippingStatus,
} from "@/lib/catalog";
import { ORDER_ACTIONS, conditionSql, type OrderActionKey } from "@/lib/order-flow";
import { orderTotals } from "@/lib/pricing";
import type { Order, OrderEvent, OrderItem, OrderSummary } from "@/lib/types";
import { getDb, isConstraintError, type InStatement, type InValue, type Row } from "../db";
import { newId, newOrderCode, newToken } from "../ids";
import { withAudit, type AuditEntry } from "./audit";
import { allocateStorage, movementStatements, type Guard } from "./inventory";
import { findCartProducts } from "./products";

const MAX_LINES = 50;

export type OrderLineInput = { variantId: string; quantity: number; expectedPrice: number };

export type OrderDraft = {
  userId: string | null;
  paymentMethod: PaymentMethod;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  shippingCity: string;
  note: string;
  // Do trình duyệt sinh cho mỗi lần thanh toán: bấm đặt hàng nhiều lần chỉ tạo một đơn (YC-GH-07).
  idempotencyKey: string | null;
  items: OrderLineInput[];
};

export type CartIssue = {
  variantId: string;
  name: string | null;
  reason: "unavailable" | "insufficient_stock" | "price_changed";
};

export type CreateOrderResult =
  | { ok: true; order: { id: string; code: string; token: string; total: number } }
  | { ok: false; reason: "empty" | "cart_changed"; issues: CartIssue[] };

function toOrderBase(row: Row): Omit<Order, "items" | "events" | "payments"> {
  const status = String(row.status);
  const paymentStatus = String(row.payment_status);
  const shippingStatus = String(row.shipping_status);
  return {
    id: String(row.id),
    code: String(row.code),
    token: String(row.token),
    userId: row.user_id === null ? null : String(row.user_id),
    status: isOrderStatus(status) ? status : "pending",
    paymentMethod: row.payment_method === "bank" ? "bank" : "cod",
    paymentStatus: isPaymentStatus(paymentStatus) ? paymentStatus : "unpaid",
    shippingStatus: isShippingStatus(shippingStatus) ? shippingStatus : "not_created",
    trackingCarrier: row.tracking_carrier === null ? null : String(row.tracking_carrier),
    trackingCode: row.tracking_code === null ? null : String(row.tracking_code),
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
    variantId: String(row.variant_id),
    name: String(row.product_name),
    variantName: String(row.variant_name),
    sku: String(row.sku),
    slug: String(row.product_slug),
    image: row.image === null ? null : String(row.image),
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
    if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0) continue;
    const existing = merged.get(item.variantId);
    if (existing) existing.quantity += item.quantity;
    else merged.set(item.variantId, { ...item });
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

// Tạo đơn hàng từ giỏ. Giá và tồn kho luôn lấy từ CSDL, không tin số liệu do trình duyệt gửi lên:
// `expectedPrice` chỉ dùng để phát hiện giá đã đổi so với lúc khách xem giỏ.
async function findOrderByIdempotencyKey(key: string) {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT id, code, token, total FROM orders WHERE idempotency_key = ?", args: [key] });
  const row = result.rows[0];
  return row ? { id: String(row.id), code: String(row.code), token: String(row.token), total: Number(row.total) } : null;
}

export async function createOrder(draft: OrderDraft): Promise<CreateOrderResult> {
  const lines = normalizeLines(draft.items);
  if (lines.length === 0) return { ok: false, reason: "empty", issues: [] };
  if (draft.idempotencyKey) {
    const existing = await findOrderByIdempotencyKey(draft.idempotencyKey);
    if (existing) return { ok: true, order: existing };
  }

  const inspect = async () => {
    const variants = new Map((await findCartProducts(lines.map((l) => l.variantId))).map((v) => [v.id, v]));
    const issues: CartIssue[] = [];
    for (const line of lines) {
      const variant = variants.get(line.variantId);
      if (!variant || !variant.available) {
        issues.push({ variantId: line.variantId, name: variant?.name ?? null, reason: "unavailable" });
      } else if (line.quantity > Math.min(variant.stock, site.maxQtyPerItem)) {
        issues.push({ variantId: line.variantId, name: variant.name, reason: "insufficient_stock" });
      } else if (variant.price !== line.expectedPrice) {
        issues.push({ variantId: line.variantId, name: variant.name, reason: "price_changed" });
      }
    }
    return { variants, issues };
  };

  const { variants, issues } = await inspect();
  if (issues.length > 0) return { ok: false, reason: "cart_changed", issues };

  // Giữ hàng theo cùng một thứ tự ở mọi đơn để hai đơn đặt chéo nhau không khoá chết lẫn nhau.
  const priced = lines
    .map((line) => ({ ...line, variant: variants.get(line.variantId)! }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId));
  const totals = orderTotals(priced.map((l) => ({ price: l.variant.price, quantity: l.quantity })));
  const db = await getDb();

  for (let attempt = 0; attempt < 3; attempt++) {
    const order = { id: newId(), code: newOrderCode(), token: newToken(24), total: totals.total };
    const now = Date.now();
    const statements: InStatement[] = [
      {
        sql: `INSERT INTO orders (
                id, code, token, user_id, idempotency_key, status, payment_method, payment_status,
                customer_name, customer_phone, customer_email, shipping_address, shipping_city, note,
                subtotal, shipping_fee, total, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id,
          order.code,
          order.token,
          draft.userId,
          draft.idempotencyKey,
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
          // Nếu biến thể vừa bị tắt, sản phẩm bị ẩn hoặc đổi giá, truy vấn con trả về NULL và vi phạm NOT NULL,
          // khiến cả lô (kể cả đơn hàng) bị huỷ. Giá, tên, SKU lưu bản chụp lúc đặt (QT-05).
          sql: `INSERT INTO order_items (order_id, variant_id, product_id, product_name, variant_name, sku, product_slug, image, unit_price, quantity)
                SELECT ?, v.id, p.id, p.name, v.name, v.sku, p.slug, COALESCE(v.image, p.image), v.price, ?
                FROM (SELECT 1) one
                LEFT JOIN product_variants v ON v.id = ? AND v.is_active AND v.price = ?
                LEFT JOIN products p ON p.id = v.product_id AND p.status = 'published'`,
          args: [order.id, line.quantity, line.variantId, line.variant.price],
        },
        // Ràng buộc reserved ≤ on_hand chặn bán vượt tồn khi hai khách đặt cùng lúc (EC-02).
        ...movementStatements({
          variantId: line.variantId,
          locationId: null,
          type: "reserve",
          qtyDelta: 0,
          reservedDelta: line.quantity,
          orderId: order.id,
          now,
        }),
      );
    }

    try {
      await db.batch(statements);
      return { ok: true, order };
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      if (error.statementIndex === 0) {
        // Cùng idempotency_key vừa được một yêu cầu song song dùng: trả về đơn đó. Còn lại là trùng mã đơn
        // hoặc token (cực hiếm): sinh mã khác rồi thử lại.
        const existing = draft.idempotencyKey ? await findOrderByIdempotencyKey(draft.idempotencyKey) : null;
        if (existing) return { ok: true, order: existing };
        continue;
      }
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
  const id = String(row.id);
  const [items, events, payments] = await db.batch([
    { sql: "SELECT * FROM order_items WHERE order_id = ? ORDER BY id", args: [id] },
    {
      sql: `SELECT e.*, u.name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
            WHERE e.order_id = ? ORDER BY e.id`,
      args: [id],
    },
    { sql: "SELECT kind, amount, reference, created_at FROM payments WHERE order_id = ? ORDER BY created_at", args: [id] },
  ]);
  return {
    ...toOrderBase(row),
    items: items.rows.map(toOrderItem),
    events: events.rows.map(
      (e): OrderEvent => ({
        field: String(e.field) as OrderEvent["field"],
        from: String(e.from_value),
        to: String(e.to_value),
        note: String(e.note),
        actorName: e.actor_name === null ? null : String(e.actor_name),
        createdAt: Number(e.created_at),
      }),
    ),
    payments: payments.rows.map((p) => ({
      kind: p.kind === "refund" ? "refund" : "charge",
      amount: Number(p.amount),
      reference: String(p.reference),
      createdAt: Number(p.created_at),
    })),
  };
}

export function findOrderByToken(token: string): Promise<Order | null> {
  return loadOrder("token = ?", token);
}

export function findOrderById(id: string): Promise<Order | null> {
  return loadOrder("id = ?", id);
}

// Tra cứu đơn cho khách không đăng nhập: phải khớp cả mã đơn lẫn số điện thoại đặt hàng.
export async function findOrderIdByCode(code: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT id FROM orders WHERE code = ?", args: [code] });
  return result.rows[0] ? String(result.rows[0].id) : null;
}

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
  shippingStatus?: ShippingStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  // Mã đơn khớp chính xác (nội dung chuyển khoản của khách chính là mã này), hoặc một phần tên, số điện thoại.
  search?: string;
  userId?: string;
  // Khoảng thời gian đặt [from, to), mili giây.
  from?: number;
  to?: number;
  // Đơn đã huỷ nhưng đã thu tiền, chờ hoàn (YC-BH-04).
  refundPending?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ items: OrderSummary[]; total: number }> {
  const filters: [string, InValue[]][] = [];
  if (query.status) filters.push(["o.status = ?", [query.status]]);
  if (query.shippingStatus) filters.push(["o.shipping_status = ?", [query.shippingStatus]]);
  if (query.paymentStatus) filters.push(["o.payment_status = ?", [query.paymentStatus]]);
  if (query.paymentMethod) filters.push(["o.payment_method = ?", [query.paymentMethod]]);
  if (query.userId) filters.push(["o.user_id = ?", [query.userId]]);
  if (query.from !== undefined) filters.push(["o.created_at >= ?", [query.from]]);
  if (query.to !== undefined) filters.push(["o.created_at < ?", [query.to]]);
  if (query.refundPending) filters.push(["o.status = 'cancelled' AND o.payment_status = 'paid'", []]);
  if (query.search) {
    const like = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    filters.push(["(o.code = ? OR o.customer_name ILIKE ? ESCAPE '\\' OR o.customer_phone LIKE ? ESCAPE '\\')", [query.search.toUpperCase(), like, like]]);
  }
  const where = filters.length ? `WHERE ${filters.map(([sql]) => sql).join(" AND ")}` : "";
  const args: InValue[] = filters.flatMap(([, values]) => values);
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
      "SELECT id, name, stock FROM product_list WHERE is_active AND stock <= 5 ORDER BY stock, name LIMIT 10",
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

async function orderLines(id: string): Promise<{ variantId: string; quantity: number }[]> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT variant_id, quantity FROM order_items WHERE order_id = ? ORDER BY variant_id", args: [id] });
  return result.rows.map((row) => ({ variantId: String(row.variant_id), quantity: Number(row.quantity) }));
}

const COLUMN = { status: "status", payment: "payment_status", shipping: "shipping_status" } as const;

export type OrderActionOptions = {
  // L6: hãng vận chuyển và mã vận đơn (bắt buộc).
  tracking?: { carrier: string; code: string };
  // L2, L14: mã giao dịch ngân hàng, ghi chú đối soát.
  reference?: string;
};

// Thực hiện một thao tác L2–L14 trong một giao dịch: khoá dòng đơn, mọi lệnh ghi (kho, thanh toán, lịch sử,
// nhật ký) chỉ chạy khi đơn còn thoả điều kiện của luật, rồi mới đổi trạng thái. Gửi lặp hoặc hai người bấm
// cùng lúc thì lần sau không ghi gì và trả về false. Sau L2 và L7 tự chạy L8 (đã giao và đã thu tiền thì hoàn tất).
export async function applyOrderAction(id: string, key: OrderActionKey, audit?: AuditEntry, options: OrderActionOptions = {}): Promise<boolean> {
  const action = ORDER_ACTIONS[key];
  if (key === "hand_over" && !options.tracking) return false;
  const condition = conditionSql(key);
  const guard: Guard = { sql: `EXISTS (SELECT 1 FROM orders WHERE id = ? AND ${condition.sql})`, args: [id, ...condition.args] };
  const actorId = audit?.actor.id ?? null;
  const now = Date.now();
  const db = await getDb();
  const statements: InStatement[] = [{ sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [id] }];

  if ("stock" in action) {
    const quarantine =
      action.stock === "return_in"
        ? String((await db.execute("SELECT id FROM locations WHERE type = 'quarantine' AND is_active ORDER BY code LIMIT 1")).rows[0]?.id ?? "")
        : "";
    if (action.stock === "return_in" && !quarantine) return false;
    for (const line of await orderLines(id)) {
      const base = { variantId: line.variantId, orderId: id, actorId, now };
      if (action.stock === "release") {
        statements.push(...movementStatements({ ...base, locationId: null, type: "release", qtyDelta: 0, reservedDelta: -line.quantity }, guard));
      } else if (action.stock === "return_in") {
        // Hàng hoàn vào khu cách ly, chưa bán lại được (Q15).
        statements.push(...movementStatements({ ...base, locationId: quarantine, type: "return_in", qtyDelta: line.quantity }, guard));
      } else {
        const picks = await allocateStorage(line.variantId, line.quantity);
        if (!picks) return false;
        for (const pick of picks) {
          statements.push(
            ...movementStatements({ ...base, locationId: pick.locationId, type: "ship", qtyDelta: -pick.qty, reservedDelta: -pick.qty }, guard),
          );
        }
      }
    }
  }

  if ("payment" in action) {
    statements.push({
      sql: `INSERT INTO payments (id, order_id, kind, method, amount, reference, confirmed_by, created_at)
            SELECT ?, id, ?, payment_method, total, ?, ?, ? FROM orders WHERE id = ? AND ${condition.sql}`,
      args: [newId(), action.payment, options.reference ?? "", actorId, now, id, ...condition.args],
    });
  }

  const sets: string[] = [];
  const setArgs: InValue[] = [];
  for (const [field, value] of Object.entries(action.set) as [keyof typeof COLUMN, string][]) {
    // Lịch sử ghi trước khi đổi để còn giá trị cũ.
    statements.push({
      sql: `INSERT INTO order_events (order_id, field, from_value, to_value, note, actor_id, created_at)
            SELECT id, ?, ${COLUMN[field]}, ?, ?, ?, ? FROM orders WHERE id = ? AND ${condition.sql}`,
      args: [COLUMN[field], value, action.rule, actorId, now, id, ...condition.args],
    });
    sets.push(`${COLUMN[field]} = ?`);
    setArgs.push(value);
  }
  if (options.tracking) {
    sets.push("tracking_carrier = ?", "tracking_code = ?");
    setArgs.push(options.tracking.carrier, options.tracking.code);
  }
  statements.push(
    withAudit(
      { sql: `UPDATE orders SET ${sets.join(", ")}, updated_at = ? WHERE id = ? AND ${condition.sql}`, args: [...setArgs, now, id, ...condition.args] },
      audit,
    ),
  );
  const changedIndex = statements.length - 1;

  const completable = "id = ? AND status = 'processing' AND shipping_status = 'delivered' AND payment_status = 'paid'";
  statements.push(
    {
      sql: `INSERT INTO order_events (order_id, field, from_value, to_value, note, created_at)
            SELECT id, 'status', status, 'completed', 'L8', ? FROM orders WHERE ${completable}`,
      args: [now, id],
    },
    { sql: `UPDATE orders SET status = 'completed', updated_at = ? WHERE ${completable}`, args: [now, id] },
  );

  try {
    const results = await db.batch(statements);
    return results[changedIndex].rowsAffected > 0;
  } catch (error) {
    // Ghi trùng (khoá duy nhất của sổ kho, payments) hoặc tồn vị trí vừa đổi: không ghi gì.
    if (isConstraintError(error)) return false;
    throw error;
  }
}

export type PickingOrder = Pick<Order, "id" | "code" | "customerName" | "createdAt"> & {
  lines: { sku: string; name: string; quantity: number; picks: { code: string; qty: number }[] | null }[];
};

// Danh sách lấy hàng (YC-KHO-16): đơn đang xử lý chưa đóng gói, mỗi dòng kèm vị trí gợi ý theo Q7.
// Vị trí tính lúc xem, không lưu; L6 tính lại đúng cách này khi xuất kho.
export async function listPickingOrders(limit = 50): Promise<PickingOrder[]> {
  const db = await getDb();
  const [orders, items] = await db.batch([
    {
      sql: `SELECT id, code, customer_name, created_at FROM orders
            WHERE status = 'processing' AND shipping_status = 'not_created' ORDER BY created_at LIMIT ?`,
      args: [limit],
    },
    `SELECT oi.order_id, oi.variant_id, oi.sku, oi.product_name, oi.variant_name, oi.quantity FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'processing' AND o.shipping_status = 'not_created' ORDER BY oi.sku`,
  ]);
  const result: PickingOrder[] = [];
  for (const row of orders.rows) {
    const lines = [];
    for (const item of items.rows.filter((i) => i.order_id === row.id)) {
      const picks = await allocateStorage(String(item.variant_id), Number(item.quantity));
      lines.push({
        sku: String(item.sku),
        name: `${item.product_name} (${item.variant_name})`,
        quantity: Number(item.quantity),
        picks: picks && picks.map(({ code, qty }) => ({ code, qty })),
      });
    }
    result.push({ id: String(row.id), code: String(row.code), customerName: String(row.customer_name), createdAt: Number(row.created_at), lines });
  }
  return result;
}
