import "server-only";
import { ORDER_STAGES, ORDER_STAGE_KEYS, NEEDS_ACTION_SQL, STAGE_RANK_SQL, type OrderStageKey } from "@/lib/order-stage";
import { site } from "@/config/site";
import {
  isPaymentMethod,
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
import { orderTotals, type CouponRejection } from "@/lib/pricing";
import { canPreorder, isOrderPreorderStatus, lineDeposit, orderDeposit, type PaymentPlan } from "@/lib/preorder";
import { flashLimit } from "@/lib/flash-sale";
import { applyBundles } from "@/lib/bundles";
import { parseConfig, type ParsedConfig } from "@/lib/workshop";
import type { Order, OrderEvent, OrderItem, OrderPulse, OrderSummary } from "@/lib/types";
import { getDb, isConstraintError, type InStatement, type InValue, type Row } from "../db";
import { newId, newOrderCode, newToken } from "../ids";
import { withAudit, type AuditEntry } from "./audit";
import { listActiveDeals } from "./bundles";
import { invoiceRequestStatement, toInvoice, type InvoiceInput } from "./invoices";
import { evaluateCoupon, redeemStatements, releaseStatements } from "./coupons";
import { allocateStorage, movementStatements, type Guard } from "./inventory";
import { findCartProducts } from "./products";

const MAX_LINES = 50;

// `expectedPrice` là đơn giá khách thấy (đã gồm tuỳ chọn Xưởng). `cfg` là cấu hình Xưởng (src/lib/workshop.ts), rỗng nếu
// nguyên hộp; cùng biến thể khác cấu hình là hai dòng. `preorder`: khách thấy dòng này là hàng đặt trước (bỏ trống thì
// không so); khác với máy chủ (đợt đặt trước vừa mở hoặc kết thúc) thì báo giỏ đã đổi.
export type OrderLineInput = { variantId: string; quantity: number; expectedPrice: number; cfg?: string; preorder?: boolean };

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
  // Mã giảm giá khách nhập (trống nếu không dùng); máy chủ tự kiểm tra lại.
  couponCode?: string;
  // Đơn có hàng đặt trước cần cọc: chỉ trả cọc trước (mặc định) hay trả đủ (src/lib/preorder.ts).
  paymentPlan?: PaymentPlan;
  // Khách yêu cầu hoá đơn VAT (mục 17): thông tin công ty, máy chủ đã kiểm định dạng.
  invoice?: InvoiceInput;
  // Đơn COD giá trị lớn cần xác nhận email (mục 15): ngưỡng và đã xác nhận chưa (mã OTP, hoặc email tài khoản đã xác thực).
  // Chỉ trang thanh toán của khách truyền vào; bỏ trống (script, dữ liệu mẫu) thì không kiểm.
  codOtp?: { from: number; verified: boolean };
  items: OrderLineInput[];
};

export type CartIssue = {
  variantId: string;
  name: string | null;
  // preorder_full: hết suất hoặc đợt đặt trước ngừng nhận; preorder_changed: dòng vừa chuyển giữa hàng có sẵn và đặt trước.
  // flash_limit: vượt số suất flash sale còn lại hoặc số tối đa mỗi đơn.
  reason: "unavailable" | "insufficient_stock" | "price_changed" | "preorder_full" | "preorder_changed" | "flash_limit";
};

export type CreateOrderResult =
  | { ok: true; order: { id: string; code: string; token: string; total: number; depositAmount: number } }
  | { ok: false; reason: "empty" | "cart_changed"; issues: CartIssue[] }
  // Hàng đặt trước cần trả trước (cọc hoặc đủ) mà khách chọn trả hết khi nhận hàng (COD).
  | { ok: false; reason: "prepayment" }
  // Đơn COD giá trị lớn cần mã OTP (nghiep-vu-ban-hang mục 15).
  | { ok: false; reason: "otp_required"; total: number }
  | { ok: false; reason: "coupon"; coupon: CouponRejection; minSubtotal?: number };

function toOrderBase(row: Row): Omit<Order, "items" | "events" | "payments" | "invoice"> {
  const status = String(row.status);
  const paymentStatus = String(row.payment_status);
  const shippingStatus = String(row.shipping_status);
  return {
    id: String(row.id),
    code: String(row.code),
    token: String(row.token),
    userId: row.user_id === null ? null : String(row.user_id),
    status: isOrderStatus(status) ? status : "pending",
    paymentMethod: isPaymentMethod(row.payment_method) ? row.payment_method : "cod",
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
    discount: Number(row.discount),
    couponCode: row.coupon_code === null ? null : String(row.coupon_code),
    shippingFee: Number(row.shipping_fee),
    total: Number(row.total),
    depositAmount: Number(row.deposit_amount ?? 0),
    bundleDiscount: Number(row.bundle_discount ?? 0),
    preorderStatus: isOrderPreorderStatus(row.preorder_status) ? row.preorder_status : "none",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toOrderItem(row: Row): OrderItem {
  return {
    lineId: Number(row.id),
    productId: String(row.product_id),
    variantId: String(row.variant_id),
    name: String(row.product_name),
    variantName: String(row.variant_name),
    sku: String(row.sku),
    slug: String(row.product_slug),
    image: row.image === null ? null : String(row.image),
    unitPrice: Number(row.unit_price),
    quantity: Number(row.quantity),
    options: String(row.options ?? ""),
    optionsPrice: Number(row.options_price ?? 0),
    optionsConfig: String(row.options_config ?? ""),
    flashSaleId: row.flash_sale_id === null || row.flash_sale_id === undefined ? null : String(row.flash_sale_id),
    preorder:
      row.preorder_offer_id === null || row.preorder_offer_id === undefined
        ? null
        : { offerId: String(row.preorder_offer_id), expectedAt: Number(row.preorder_expected_at), allocated: Boolean(row.preorder_allocated) },
  };
}

function toOrderSummary(row: Row): OrderSummary {
  return { ...toOrderBase(row), itemCount: Number(row.item_count) };
}

// Gộp các dòng trùng sản phẩm và cấu hình, loại bỏ số lượng không hợp lệ.
function normalizeLines(items: readonly OrderLineInput[]): (OrderLineInput & { cfg: string })[] {
  const merged = new Map<string, OrderLineInput & { cfg: string }>();
  for (const item of items) {
    if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0) continue;
    const key = `${item.variantId}~${item.cfg ?? ""}`;
    const existing = merged.get(key);
    if (existing) existing.quantity += item.quantity;
    else merged.set(key, { ...item, cfg: item.cfg ?? "" });
  }
  return [...merged.values()].slice(0, MAX_LINES);
}

// Tạo đơn hàng từ giỏ. Giá và tồn kho luôn lấy từ CSDL, không tin số liệu do trình duyệt gửi lên:
// `expectedPrice` chỉ dùng để phát hiện giá đã đổi so với lúc khách xem giỏ.
async function findOrderByIdempotencyKey(key: string) {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT id, code, token, total, deposit_amount FROM orders WHERE idempotency_key = ?", args: [key] });
  const row = result.rows[0];
  return row ? { id: String(row.id), code: String(row.code), token: String(row.token), total: Number(row.total), depositAmount: Number(row.deposit_amount) } : null;
}

export async function createOrder(draft: OrderDraft): Promise<CreateOrderResult> {
  const lines = normalizeLines(draft.items);
  if (lines.length === 0) return { ok: false, reason: "empty", issues: [] };
  if (draft.idempotencyKey) {
    const existing = await findOrderByIdempotencyKey(draft.idempotencyKey);
    if (existing) return { ok: true, order: existing };
  }

  // Giá tính theo thời điểm đặt (flash sale, src/lib/flash-sale.ts): cùng một mốc cho kiểm tra và câu ghi.
  const placedAt = Date.now();
  const inspect = async () => {
    const variants = new Map((await findCartProducts(lines.map((l) => l.variantId), placedAt)).map((v) => [v.id, v]));
    // Tồn kho tính theo biến thể, cộng mọi dòng cùng biến thể (khác cấu hình Xưởng).
    const perVariant = new Map<string, number>();
    for (const line of lines) perVariant.set(line.variantId, (perVariant.get(line.variantId) ?? 0) + line.quantity);
    const issues: CartIssue[] = [];
    const configs = new Map<string, ParsedConfig>();
    for (const line of lines) {
      const variant = variants.get(line.variantId);
      const config = variant ? parseConfig(line.cfg, variant.category) : null;
      const wanted = perVariant.get(line.variantId) ?? 0;
      if (!variant || !variant.available || !config) {
        issues.push({ variantId: line.variantId, name: variant?.name ?? null, reason: "unavailable" });
      } else if (line.preorder !== undefined && line.preorder !== (variant.preorder !== null)) {
        issues.push({ variantId: line.variantId, name: variant.name, reason: "preorder_changed" });
      } else if (variant.preorder) {
        // Hàng đặt trước giới hạn theo suất còn lại của đợt, không theo tồn kho.
        if (!canPreorder(variant.preorder) || wanted > Math.min(variant.preorder.left ?? site.maxQtyPerItem, site.maxQtyPerItem)) {
          issues.push({ variantId: line.variantId, name: variant.name, reason: "preorder_full" });
        } else if (variant.flash && wanted > flashLimit(variant.flash)) {
          issues.push({ variantId: line.variantId, name: variant.name, reason: "flash_limit" });
        } else if (variant.price + config.price !== line.expectedPrice) {
          issues.push({ variantId: line.variantId, name: variant.name, reason: "price_changed" });
        }
      } else if (wanted > Math.min(variant.stock, site.maxQtyPerItem)) {
        issues.push({ variantId: line.variantId, name: variant.name, reason: "insufficient_stock" });
      } else if (variant.flash && wanted > flashLimit(variant.flash)) {
        // Giá flash sale chỉ cho số suất còn lại và số tối đa mỗi đơn.
        issues.push({ variantId: line.variantId, name: variant.name, reason: "flash_limit" });
      } else if (variant.price + config.price !== line.expectedPrice) {
        issues.push({ variantId: line.variantId, name: variant.name, reason: "price_changed" });
      }
      if (config) configs.set(`${line.variantId}~${line.cfg}`, config);
    }
    return { variants, configs, issues };
  };

  const { variants, configs, issues } = await inspect();
  if (issues.length > 0) return { ok: false, reason: "cart_changed", issues };

  // Giữ hàng theo cùng một thứ tự ở mọi đơn để hai đơn đặt chéo nhau không khoá chết lẫn nhau.
  const priced = lines
    .map((line) => ({ ...line, variant: variants.get(line.variantId)!, config: configs.get(`${line.variantId}~${line.cfg}`)! }))
    .sort((a, b) => a.variantId.localeCompare(b.variantId) || a.cfg.localeCompare(b.cfg));
  const pricedLines = priced.map((l) => ({ variantId: l.variantId, price: l.variant.price + l.config.price, quantity: l.quantity }));
  const coupon = draft.couponCode ? await evaluateCoupon(draft.couponCode, pricedLines) : null;
  if (coupon && !coupon.ok) return { ok: false, reason: "coupon", coupon: coupon.reason, minSubtotal: coupon.minSubtotal };
  // Combo (src/lib/bundles.ts): giảm trên giá phiên bản (không gồm tuỳ chọn Xưởng), cộng với mã giảm giá, không vượt tạm tính.
  const bundle = applyBundles(
    priced.map((line) => ({ productId: line.variant.productId, unitPrice: line.variant.price, quantity: line.quantity })),
    await listActiveDeals(priced.map((line) => line.variant.productId)),
  );
  const subtotal = pricedLines.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const bundleDiscount = Math.min(bundle.discount, subtotal);
  const totals = orderTotals(pricedLines, Math.min(subtotal, (coupon?.discount ?? 0) + bundleDiscount));
  // Đặt trước: cọc tính trên các dòng đặt trước theo % của đợt. Cọc từ tổng đơn trở lên thì phải trả đủ; trả đủ thì không
  // nhận COD (COD đi với cọc: cọc chuyển khoản, phần còn lại trả khi nhận).
  const preorderLines = priced.filter((line) => line.variant.preorder);
  const deposit = preorderLines.reduce(
    (sum, line) => sum + lineDeposit(line.variant.price + line.config.price, line.quantity, line.variant.preorder!.depositPercent),
    0,
  );
  const depositAmount = orderDeposit(deposit, totals.total, draft.paymentPlan ?? "deposit");
  if (deposit > 0 && depositAmount === 0 && draft.paymentMethod === "cod") return { ok: false, reason: "prepayment" };
  // COD giá trị lớn: phần còn phải trả khi nhận hàng từ ngưỡng thì cần xác nhận email bằng OTP.
  if (draft.codOtp && draft.paymentMethod === "cod" && totals.total - depositAmount >= draft.codOtp.from && !draft.codOtp.verified) {
    return { ok: false, reason: "otp_required", total: totals.total };
  }
  const preorderStatus = preorderLines.length > 0 ? "waiting" : "none";
  const offerIds = [...new Set(preorderLines.map((line) => line.variant.preorder!.id))].sort();
  // Dòng bán bằng giá flash sale (mỗi biến thể một chương trình), theo thứ tự biến thể để khoá cùng thứ tự ở mọi đơn.
  const flashKeys = [...new Map(priced.filter((line) => line.variant.flash).map((line) => [line.variantId, line.variant.flash!.saleId])).entries()];
  const db = await getDb();

  for (let attempt = 0; attempt < 3; attempt++) {
    const order = { id: newId(), code: newOrderCode(), token: newToken(24), total: totals.total, depositAmount };
    const now = placedAt;
    const statements: InStatement[] = [
      {
        sql: `INSERT INTO orders (
                id, code, token, user_id, idempotency_key, status, payment_method, payment_status,
                customer_name, customer_phone, customer_email, shipping_address, shipping_city, note,
                subtotal, discount, coupon_code, shipping_fee, total, deposit_amount, preorder_status, bundle_discount, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          totals.discount,
          coupon?.coupon.code ?? null,
          totals.shipping,
          totals.total,
          depositAmount,
          preorderStatus,
          bundleDiscount,
          now,
          now,
        ],
      },
    ];
    // Khoá các đợt đặt trước (theo mã, cùng thứ tự ở mọi đơn) để hai khách đặt suất cuối cùng lúc không vượt số suất:
    // đơn sau chờ đơn trước xong rồi mới đếm lại.
    if (offerIds.length > 0) {
      statements.push({ sql: `SELECT id FROM preorder_offers WHERE id IN (${offerIds.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`, args: offerIds });
    }
    // Khoá suất flash sale như đợt đặt trước: hai khách mua suất cuối cùng lúc thì đơn sau đếm lại.
    if (flashKeys.length > 0) {
      statements.push({
        sql: `SELECT 1 FROM flash_sale_items WHERE ${flashKeys.map(() => "(variant_id = ? AND sale_id = ?)").join(" OR ")}
              ORDER BY variant_id, sale_id FOR UPDATE`,
        args: flashKeys.flat(),
      });
    }
    for (const line of priced) {
      const offer = line.variant.preorder;
      // Dòng đặt trước: đợt phải còn mở và còn đủ suất (tính cả dòng vừa ghi của chính đơn này). Dòng thường: phiên bản không
      // được đang trong đợt đặt trước (hàng về phải dành cho người đã đặt trước).
      const offerGuard = offer
        ? `EXISTS (SELECT 1 FROM preorder_offers po WHERE po.id = ? AND po.variant_id = v.id AND po.status = 'open'
             AND (po.max_qty IS NULL OR (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                         WHERE oi.preorder_offer_id = po.id AND o.status <> 'cancelled') + ?::int <= po.max_qty))`
        : "NOT EXISTS (SELECT 1 FROM preorder_offers po WHERE po.variant_id = v.id AND po.status <> 'ended')";
      // Dòng giá flash sale: chương trình vẫn bật, đang trong khung giờ, giá sale không đổi và còn đủ suất (tính cả dòng vừa
      // ghi của chính đơn này).
      const flash = line.variant.flash;
      const flashGuard = flash
        ? ` AND EXISTS (SELECT 1 FROM flash_sale_items fi JOIN flash_sales fs ON fs.id = fi.sale_id
             WHERE fi.sale_id = ? AND fi.variant_id = v.id AND fi.sale_price = ? AND fs.is_active AND fs.starts_at <= ? AND fs.ends_at > ?
               AND (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
                    WHERE oi.flash_sale_id = fi.sale_id AND oi.variant_id = fi.variant_id AND o.status <> 'cancelled') + ?::int <= fi.qty_limit)`
        : "";
      statements.push({
        // Nếu biến thể vừa bị tắt, sản phẩm bị ẩn, đổi giá, đợt đặt trước hoặc flash sale vừa đổi, truy vấn con trả về NULL và
        // vi phạm NOT NULL, khiến cả lô (kể cả đơn hàng) bị huỷ. Giá, tên, SKU lưu bản chụp lúc đặt (QT-05).
        // Đơn giá = giá bán lúc đặt (giá thường hoặc giá flash sale) + giá tuỳ chọn Xưởng (máy chủ tự tính, không tin trình duyệt).
        sql: `INSERT INTO order_items (order_id, variant_id, product_id, product_name, variant_name, sku, product_slug, image, unit_price, quantity,
                options, options_price, options_config, preorder_offer_id, flash_sale_id)
              SELECT ?, v.id, p.id, p.name, v.name, v.sku, p.slug, COALESCE(v.image, p.image), ?::bigint, ?, ?, ?, ?, ?, ?
              FROM (SELECT 1) one
              LEFT JOIN product_variants v ON v.id = ? AND v.is_active AND v.price = ? AND ${offerGuard}${flashGuard}
              LEFT JOIN products p ON p.id = v.product_id AND p.status = 'published'`,
        args: [
          order.id,
          line.variant.price + line.config.price,
          line.quantity,
          line.config.summary,
          line.config.price,
          line.cfg,
          offer?.id ?? null,
          flash?.saleId ?? null,
          line.variantId,
          line.variant.basePrice,
          ...(offer ? [offer.id, line.quantity] : []),
          ...(flash ? [flash.saleId, flash.price, now, now, line.quantity] : []),
        ],
      });
    }
    // Giữ hàng một lần cho mỗi biến thể với tổng số lượng mọi cấu hình Xưởng (sổ kho chỉ nhận một dòng giữ hàng cho mỗi
    // đơn và biến thể, ràng buộc movement_unique). Ràng buộc reserved ≤ on_hand chặn bán vượt tồn khi hai khách đặt cùng
    // lúc (EC-02). `priced` đã sắp theo biến thể nên thứ tự khoá vẫn giống nhau ở mọi đơn. Hàng đặt trước không giữ tồn
    // (kho chưa có hàng): giữ lúc phân bổ (src/server/repo/preorders.ts).
    const reserve = new Map<string, number>();
    for (const line of priced) {
      if (!line.variant.preorder) reserve.set(line.variantId, (reserve.get(line.variantId) ?? 0) + line.quantity);
    }
    for (const [variantId, quantity] of reserve) {
      statements.push(
        ...movementStatements({ variantId, locationId: null, type: "reserve", qtyDelta: 0, reservedDelta: quantity, orderId: order.id, now }),
      );
    }

    if (draft.invoice) statements.push(invoiceRequestStatement(order.id, draft.invoice, now));
    const couponIndex = statements.length;
    if (coupon) statements.push(...redeemStatements(coupon.coupon, order.id, coupon.discount, now));

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
      if (coupon && (error.statementIndex ?? -1) >= couponIndex) {
        // Mã vừa hết lượt, bị tắt hoặc bị sửa trong lúc đặt: báo lý do mới nhất.
        const again = await evaluateCoupon(coupon.coupon.code, pricedLines);
        return { ok: false, reason: "coupon", coupon: again.ok ? "exhausted" : again.reason };
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
  const [items, events, payments, invoice] = await db.batch([
    {
      // Dòng đặt trước: ngày dự kiến về lấy theo đợt hiện tại (nhân viên có thể dời ngày); đã phân bổ = có dòng giữ hàng.
      sql: `SELECT oi.*, po.expected_at AS preorder_expected_at,
                   EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id = oi.order_id AND m.variant_id = oi.variant_id AND m.type = 'reserve') AS preorder_allocated
            FROM order_items oi LEFT JOIN preorder_offers po ON po.id = oi.preorder_offer_id
            WHERE oi.order_id = ? ORDER BY oi.id`,
      args: [id],
    },
    {
      sql: `SELECT e.*, u.name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
            WHERE e.order_id = ? ORDER BY e.id`,
      args: [id],
    },
    { sql: "SELECT kind, amount, reference, created_at FROM payments WHERE order_id = ? ORDER BY created_at", args: [id] },
    { sql: "SELECT * FROM order_invoices WHERE order_id = ?", args: [id] },
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
      kind: p.kind === "refund" ? "refund" : p.kind === "deposit" ? "deposit" : "charge",
      amount: Number(p.amount),
      reference: String(p.reference),
      createdAt: Number(p.created_at),
    })),
    invoice: invoice.rows[0] ? toInvoice(invoice.rows[0]) : null,
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
  // Bước xử lý (src/lib/order-stage.ts).
  stage?: OrderStageKey;
  // "priority": việc cần làm ngay lên đầu, rồi mới tới đơn mới nhất.
  sort?: "priority" | "newest";
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
  if (query.refundPending) filters.push(["o.status = 'cancelled' AND o.payment_status IN ('paid', 'deposit_paid')", []]);
  if (query.stage) filters.push([`(${ORDER_STAGES[query.stage].sql})`, []]);
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
        sql: `${SUMMARY_SQL} ${where} ORDER BY ${query.sort === "priority" ? `${STAGE_RANK_SQL}, ` : ""}o.created_at DESC LIMIT ? OFFSET ?`,
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

// Số lượng theo biến thể để ghi sổ kho (xuất, huỷ giữ, nhận trả). Cộng các dòng cùng biến thể khác cấu hình Xưởng: sổ kho
// chỉ nhận một dòng cho mỗi đơn, biến thể, loại biến động (ràng buộc movement_unique).
async function orderLines(id: string): Promise<{ variantId: string; quantity: number }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT variant_id, SUM(quantity)::int AS quantity FROM order_items WHERE order_id = ? GROUP BY variant_id ORDER BY variant_id",
    args: [id],
  });
  return result.rows.map((row) => ({ variantId: String(row.variant_id), quantity: Number(row.quantity) }));
}

// Số đang giữ cho đơn theo sổ kho, từng biến thể. Huỷ đơn chỉ trả lại phần này: dòng đặt trước chưa phân bổ không giữ gì.
async function reservedLines(id: string): Promise<{ variantId: string; quantity: number }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT variant_id, SUM(reserved_delta)::int AS quantity FROM stock_movements WHERE order_id = ?
          GROUP BY variant_id HAVING SUM(reserved_delta) > 0 ORDER BY variant_id`,
    args: [id],
  });
  return result.rows.map((row) => ({ variantId: String(row.variant_id), quantity: Number(row.quantity) }));
}

const COLUMN = { status: "status", payment: "payment_status", shipping: "shipping_status" } as const;

// Số tiền và phương thức của dòng payments mỗi thao tác ghi (bảng orders). Thu sau khi đã cọc là phần còn lại; hoàn là mọi
// khoản đã thu. Tiền cọc của đơn COD đi bằng chuyển khoản.
const PAYMENT_SQL = {
  deposit: { amount: "deposit_amount", method: "CASE WHEN payment_method = 'cod' THEN 'bank' ELSE payment_method END" },
  charge: { amount: "total - CASE WHEN payment_status = 'deposit_paid' THEN deposit_amount ELSE 0 END", method: "payment_method" },
  refund: {
    amount: "(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.order_id = orders.id AND p.kind IN ('deposit', 'charge'))",
    method: "payment_method",
  },
} as const;

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
  // L11 nhận lại cả đơn. Đã có phiếu nhập hàng trả ghi sổ cho đơn này thì phần đó đã vào kho: nhận thêm bằng
  // L11 sẽ cộng trùng, nên chặn và xử lý phần còn lại bằng phiếu hàng trả.
  if (key === "receive_return") {
    condition.sql += " AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id = orders.id AND m.type = 'return_in' AND m.document_id IS NOT NULL)";
  }
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
    for (const line of action.stock === "release" ? await reservedLines(id) : await orderLines(id)) {
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

  // EC-07: huỷ đơn thì trả lại lượt dùng mã giảm giá.
  if ("status" in action.set && action.set.status === "cancelled") statements.push(...releaseStatements(id, guard, now));

  if ("payment" in action) {
    const money = PAYMENT_SQL[action.payment];
    statements.push({
      sql: `INSERT INTO payments (id, order_id, kind, method, amount, reference, confirmed_by, created_at)
            SELECT ?, id, ?, ${money.method}, ${money.amount}, ?, ?, ? FROM orders WHERE id = ? AND ${condition.sql}`,
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

  let changed: boolean;
  try {
    const results = await db.batch(statements);
    changed = results[changedIndex].rowsAffected > 0;
  } catch (error) {
    // Ghi trùng (khoá duy nhất của sổ kho, payments) hoặc tồn vị trí vừa đổi: không ghi gì.
    if (isConstraintError(error)) return false;
    throw error;
  }
  // Báo khách qua email (nghiep-vu-ban-hang mục 3). Nạp động để tránh vòng lặp import (order-mails đọc đơn từ file này);
  // hàm không ném lỗi nên thư lỗi không làm hỏng thao tác trên đơn.
  if (changed) await (await import("../email/order-mails")).notifyOrderEvent(id, key);
  return changed;
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
    `SELECT oi.order_id, oi.variant_id, oi.sku, oi.product_name, oi.variant_name, oi.quantity, oi.options FROM order_items oi
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
        // Có tuỳ biến Xưởng thì ghi kèm để thợ chuyển qua xưởng trước khi đóng gói.
        name: `${item.product_name} (${item.variant_name})${item.options ? ` · Xưởng: ${String(item.options)}` : ""}`,
        quantity: Number(item.quantity),
        picks: picks && picks.map(({ code, qty }) => ({ code, qty })),
      });
    }
    result.push({ id: String(row.id), code: String(row.code), customerName: String(row.customer_name), createdAt: Number(row.created_at), lines });
  }
  return result;
}

export type OrderMovement = {
  type: string;
  sku: string;
  qty: number;
  reserved: number;
  locationCode: string | null;
  documentId: string | null;
  documentCode: string | null;
  createdAt: number;
};

// Các dòng sổ kho gắn với một đơn (giữ hàng, xuất giao, nhận hoàn, phiếu hàng trả), để trang đơn cho thấy
// hàng của đơn đã trừ khỏi kho lúc nào và ở vị trí nào.
export async function listOrderMovements(orderId: string): Promise<OrderMovement[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT m.type, v.sku, m.qty_delta, m.reserved_delta, l.code AS location_code, m.document_id, d.code AS document_code, m.created_at
          FROM stock_movements m
          JOIN product_variants v ON v.id = m.variant_id
          LEFT JOIN locations l ON l.id = m.location_id
          LEFT JOIN stock_documents d ON d.id = m.document_id
          WHERE m.order_id = ? ORDER BY m.created_at, m.id`,
    args: [orderId],
  });
  return result.rows.map((row) => ({
    type: String(row.type),
    sku: String(row.sku),
    qty: Number(row.qty_delta),
    reserved: Number(row.reserved_delta),
    locationCode: row.location_code === null ? null : String(row.location_code),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentCode: row.document_code === null ? null : String(row.document_code),
    createdAt: Number(row.created_at),
  }));
}

// Số đơn ở từng bước xử lý.
export async function countOrderStages(): Promise<Record<OrderStageKey, number>> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT ${ORDER_STAGE_KEYS.map((key, index) => `COUNT(*) FILTER (WHERE ${ORDER_STAGES[key].sql}) AS s${index}`).join(", ")} FROM orders o`,
  );
  const row = result.rows[0];
  return Object.fromEntries(ORDER_STAGE_KEYS.map((key, index) => [key, Number(row[`s${index}`] ?? 0)])) as Record<OrderStageKey, number>;
}

// Truy vấn nhẹ cho thanh bên quản trị hỏi định kỳ: số đơn cần xử lý và đơn mới nhất.
export async function orderPulse(): Promise<OrderPulse> {
  const db = await getDb();
  const [count, latest] = await db.batch([
    `SELECT COUNT(*) AS n FROM orders o WHERE ${NEEDS_ACTION_SQL}`,
    "SELECT id, code, customer_name, total, created_at FROM orders ORDER BY created_at DESC LIMIT 1",
  ]);
  const row = latest.rows[0];
  return {
    needsAction: Number(count.rows[0].n),
    latest: row
      ? { id: String(row.id), code: String(row.code), customerName: String(row.customer_name), total: Number(row.total), createdAt: Number(row.created_at) }
      : null,
  };
}
