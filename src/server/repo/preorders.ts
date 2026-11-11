import "server-only";
import { confirmableSql } from "@/lib/order-flow";
import { isOfferStatus, parsePreorder, type OfferStatus, type PreorderOffer } from "@/lib/preorder";
import type { OrderStatus, PaymentStatus } from "@/lib/catalog";
import type { ProductSummary } from "@/lib/types";
import { getDb, isConstraintError, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";
import { movementStatements } from "./inventory";
import { preorderJson, summaryColumns, toSummary } from "./products";

// Hàng sắp về và đặt trước (src/lib/preorder.ts, docs/ke-hoach/nghiep-vu-ban-hang.md mục 10).

export type OfferInput = { expectedAt: number; depositPercent: number; maxQty: number | null; note: string };

export type OfferRow = OfferInput & {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  status: OfferStatus;
  // Suất đã đặt (đơn chưa huỷ), số đã phân bổ hàng, số đang chờ hàng (đơn còn mở, chưa phân bổ).
  taken: number;
  allocated: number;
  waiting: number;
  // Số có thể bán của phiên bản lúc này (on_hand − reserved): hàng đã về, chưa giữ cho ai.
  available: number;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
};

// Đã phân bổ: có dòng giữ hàng của đơn cho phiên bản đó.
const ALLOCATED = "EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id = oi.order_id AND m.variant_id = oi.variant_id AND m.type = 'reserve')";

const OFFER_SELECT = `
  SELECT po.*, v.product_id, v.name AS variant_name, v.sku, p.name AS product_name, p.slug AS product_slug,
         COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = po.variant_id), 0)::int AS available,
         COALESCE(l.taken, 0)::int AS taken, COALESCE(l.allocated, 0)::int AS allocated, COALESCE(l.waiting, 0)::int AS waiting
  FROM preorder_offers po
  JOIN product_variants v ON v.id = po.variant_id
  JOIN products p ON p.id = v.product_id
  LEFT JOIN LATERAL (
    SELECT SUM(oi.quantity) AS taken,
           SUM(oi.quantity) FILTER (WHERE ${ALLOCATED}) AS allocated,
           SUM(oi.quantity) FILTER (WHERE NOT ${ALLOCATED} AND o.status IN ('pending', 'confirmed')) AS waiting
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.preorder_offer_id = po.id AND o.status <> 'cancelled'
  ) l ON true`;

function toOffer(row: Row): OfferRow {
  return {
    id: String(row.id),
    variantId: String(row.variant_id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productSlug: String(row.product_slug),
    variantName: String(row.variant_name),
    sku: String(row.sku),
    status: isOfferStatus(row.status) ? row.status : "ended",
    expectedAt: Number(row.expected_at),
    depositPercent: Number(row.deposit_percent),
    maxQty: row.max_qty === null ? null : Number(row.max_qty),
    note: String(row.note),
    taken: Number(row.taken),
    allocated: Number(row.allocated),
    waiting: Number(row.waiting),
    available: Number(row.available),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    endedAt: row.ended_at === null ? null : Number(row.ended_at),
  };
}

// Danh sách quản trị: đợt chưa kết thúc (đã có hàng về chờ phân bổ lên đầu, rồi theo ngày về), hoặc đợt đã kết thúc.
export async function listOffers(scope: "live" | "ended"): Promise<OfferRow[]> {
  const db = await getDb();
  const result = await db.execute(
    scope === "live"
      ? `SELECT * FROM (${OFFER_SELECT} WHERE po.status <> 'ended') t ORDER BY (t.waiting > 0 AND t.available > 0) DESC, t.expected_at, t.id`
      : `${OFFER_SELECT} WHERE po.status = 'ended' ORDER BY po.ended_at DESC LIMIT 100`,
  );
  return result.rows.map(toOffer);
}

export async function findOffer(id: string): Promise<OfferRow | null> {
  const db = await getDb();
  const result = await db.execute({ sql: `${OFFER_SELECT} WHERE po.id = ?`, args: [id] });
  return result.rows[0] ? toOffer(result.rows[0]) : null;
}

export type OfferLine = {
  orderId: string;
  orderCode: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  quantity: number;
  allocated: boolean;
  // Đủ điều kiện nhận hàng khi phân bổ: đã nhận cọc hoặc tiền, hoặc COD không cọc.
  confirmable: boolean;
  createdAt: number;
};

// Các đơn đặt trong một đợt, theo thứ tự đặt (cũng là thứ tự phân bổ).
export async function listOfferLines(offerId: string): Promise<OfferLine[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT o.id, o.code, o.status, o.payment_status, o.created_at, SUM(oi.quantity)::int AS quantity,
                 bool_and(${ALLOCATED}) AS allocated, ${confirmableSql("o.")} AS confirmable
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.preorder_offer_id = ?
          GROUP BY o.id ORDER BY o.created_at, o.id LIMIT 500`,
    args: [offerId],
  });
  return result.rows.map((row) => ({
    orderId: String(row.id),
    orderCode: String(row.code),
    status: String(row.status) as OrderStatus,
    paymentStatus: String(row.payment_status) as PaymentStatus,
    quantity: Number(row.quantity),
    allocated: Boolean(row.allocated),
    confirmable: Boolean(row.confirmable),
    createdAt: Number(row.created_at),
  }));
}

export type CreateOfferResult = { ok: true; id: string } | { ok: false; reason: "not_found" | "exists" };

// Mở đợt đặt trước cho một phiên bản đang bán. Phiên bản đã có đợt chưa kết thúc thì từ chối (chỉ mục idx_preorder_offers_live).
export async function createOffer(variantId: string, input: OfferInput, audit: AuditEntry): Promise<CreateOfferResult> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  try {
    const result = await db.execute(
      withAudit(
        {
          sql: `INSERT INTO preorder_offers (id, variant_id, status, expected_at, deposit_percent, max_qty, note, created_by, created_at, updated_at)
                SELECT ?, v.id, 'open', ?, ?, ?, ?, ?, ?, ? FROM product_variants v WHERE v.id = ? AND v.is_active`,
          args: [id, input.expectedAt, input.depositPercent, input.maxQty, input.note, audit.actor.id, now, now, variantId],
        },
        { ...audit, entityId: id },
      ),
    );
    return result.rowsAffected > 0 ? { ok: true, id } : { ok: false, reason: "not_found" };
  } catch (error) {
    if (isConstraintError(error)) return { ok: false, reason: "exists" };
    throw error;
  }
}

export type UpdateOfferResult =
  | { ok: true; etaChanged: boolean; previousAt: number }
  | { ok: false; reason: "not_found" | "below_taken" };

// Sửa ngày về, % cọc (chỉ áp cho đơn đặt sau), số suất (không thấp hơn số đã đặt), ghi chú.
export async function updateOffer(id: string, input: OfferInput, audit: AuditEntry): Promise<UpdateOfferResult> {
  const before = await findOffer(id);
  if (!before || before.status === "ended") return { ok: false, reason: "not_found" };
  if (input.maxQty !== null && input.maxQty < before.taken) return { ok: false, reason: "below_taken" };
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      {
        sql: `UPDATE preorder_offers SET expected_at = ?, deposit_percent = ?, max_qty = ?, note = ?, updated_at = ?
              WHERE id = ? AND status <> 'ended'`,
        args: [input.expectedAt, input.depositPercent, input.maxQty, input.note, Date.now(), id],
      },
      audit,
    ),
  );
  if (result.rowsAffected === 0) return { ok: false, reason: "not_found" };
  return { ok: true, etaChanged: before.expectedAt !== input.expectedAt, previousAt: before.expectedAt };
}

// Ngừng nhận đặt (đủ suất, nhà cung cấp báo hết) hoặc mở lại. Không áp cho đợt đã kết thúc.
export async function setOfferAccepting(id: string, open: boolean, audit: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      {
        sql: "UPDATE preorder_offers SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
        args: [open ? "open" : "closed", Date.now(), id, open ? "closed" : "open"],
      },
      audit,
    ),
  );
  return result.rowsAffected > 0;
}

// Kết thúc đợt: phiên bản bán lại như thường theo tồn kho. Còn đơn chờ hàng (chưa phân bổ) thì không cho kết thúc, vì
// hàng về sau đó sẽ bị khách khác mua mất; phân bổ hoặc huỷ các đơn đó trước.
export async function endOffer(id: string, audit: AuditEntry): Promise<"ended" | "waiting" | "not_found"> {
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      {
        sql: `UPDATE preorder_offers SET status = 'ended', ended_at = ?, updated_at = ? WHERE id = ? AND status <> 'ended'
                AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                WHERE oi.preorder_offer_id = preorder_offers.id AND o.status IN ('pending', 'confirmed', 'processing')
                                  AND NOT ${ALLOCATED})`,
        args: [Date.now(), Date.now(), id],
      },
      audit,
    ),
  );
  if (result.rowsAffected > 0) return "ended";
  const offer = await findOffer(id);
  return offer && offer.status !== "ended" ? "waiting" : "not_found";
}

export type AllocationResult = {
  // Số đơn vừa được giữ hàng, và các đơn vừa có đủ hàng đặt trước (gửi thư "hàng đã về").
  allocated: number;
  readyOrders: string[];
  // Đơn đủ điều kiện còn chờ vì thiếu hàng; đơn chưa cọc, chưa trả bị bỏ qua (nhận hàng sau khi trả, nếu còn).
  short: number;
  unpaidSkipped: number;
};

// Phân bổ hàng đã về cho các đơn đặt trước, theo thứ tự đặt (đơn đến trước nhận trước, không nhảy cóc): mỗi đơn một giao
// dịch giữ hàng (sổ kho 'reserve') cho đủ số lượng của đơn. Ràng buộc reserved ≤ on_hand chặn giữ vượt số đã về; khoá
// duy nhất của sổ kho chặn giữ hai lần khi hai người cùng bấm. Đơn đã đủ mọi dòng đặt trước chuyển sang 'ready'.
export async function allocateOffer(id: string, audit: AuditEntry): Promise<AllocationResult | null> {
  const offer = await findOffer(id);
  if (!offer || offer.status === "ended") return null;
  const lines = (await listOfferLines(id)).filter((line) => !line.allocated && (line.status === "pending" || line.status === "confirmed"));
  const db = await getDb();
  let available = offer.available;
  const result: AllocationResult = { allocated: 0, readyOrders: [], short: 0, unpaidSkipped: 0 };
  let blocked = false;
  for (const line of lines) {
    if (!line.confirmable) {
      result.unpaidSkipped += 1;
      continue;
    }
    if (blocked || line.quantity > available) {
      blocked = true;
      result.short += 1;
      continue;
    }
    const now = Date.now();
    const open = "status IN ('pending', 'confirmed') AND preorder_status = 'waiting'";
    const guard = { sql: `EXISTS (SELECT 1 FROM orders WHERE id = ? AND ${open})`, args: [line.orderId] };
    // Đơn đủ hàng khi không còn dòng đặt trước nào chưa có dòng giữ hàng (tính cả dòng vừa ghi trong giao dịch này).
    const complete = `id = ? AND ${open} AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id
                        AND oi.preorder_offer_id IS NOT NULL AND NOT ${ALLOCATED})`;
    const statements: InStatement[] = [
      { sql: "SELECT id FROM preorder_offers WHERE id = ? FOR UPDATE", args: [id] },
      { sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [line.orderId] },
      ...movementStatements(
        { variantId: offer.variantId, locationId: null, type: "reserve", qtyDelta: 0, reservedDelta: line.quantity, orderId: line.orderId, actorId: audit.actor.id, reason: "Phân bổ hàng đặt trước", now },
        guard,
      ),
      {
        sql: `INSERT INTO order_events (order_id, field, from_value, to_value, note, actor_id, created_at)
              SELECT id, 'preorder_status', preorder_status, 'ready', 'Hàng đặt trước đã về', ?, ? FROM orders WHERE ${complete}`,
        args: [audit.actor.id, now, line.orderId],
      },
      withAudit(
        { sql: `UPDATE orders SET preorder_status = 'ready', updated_at = ? WHERE ${complete}`, args: [now, line.orderId] },
        { ...audit, summary: `${audit.summary}: đơn ${line.orderCode} đủ hàng` },
      ),
    ];
    try {
      const results = await db.batch(statements);
      result.allocated += 1;
      available -= line.quantity;
      if (results[results.length - 1].rowsAffected > 0) result.readyOrders.push(line.orderId);
    } catch (error) {
      if (!isConstraintError(error)) throw error;
      // Tồn vừa đổi (vượt số đã về) hoặc người khác vừa phân bổ đơn này: dừng, số liệu trên trang sẽ được tải lại.
      blocked = true;
      result.short += 1;
    }
  }
  return result;
}

// Đơn đang chờ hàng của một đợt (để báo dời ngày về): mã, token, email khách.
export async function listWaitingOrders(offerId: string): Promise<string[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT DISTINCT o.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE oi.preorder_offer_id = ? AND o.status IN ('pending', 'confirmed') AND NOT ${ALLOCATED}`,
    args: [offerId],
  });
  return result.rows.map((row) => String(row.id));
}

export type ComingProduct = { product: ProductSummary; variantName: string; isDefaultVariant: boolean; offer: PreorderOffer };

// Trang "Hàng sắp về": phiên bản đang trong đợt đặt trước của sản phẩm đang bán, về sớm trước.
export async function listComingProducts(): Promise<ComingProduct[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT ${summaryColumns("p")}, v.id AS offer_variant_id, v.name AS offer_variant_name, v.is_default AS offer_is_default,
            v.price AS offer_price, v.compare_at_price AS offer_compare_at_price, ${preorderJson("v.id")} AS offer
     FROM preorder_offers po
     JOIN product_variants v ON v.id = po.variant_id AND v.is_active
     JOIN product_list p ON p.id = v.product_id AND p.is_active
     WHERE po.status <> 'ended'
     ORDER BY po.status = 'open' DESC, po.expected_at, p.name`,
  );
  return result.rows.flatMap((row) => {
    const offer = parsePreorder(row.offer);
    if (!offer) return [];
    const product = toSummary(row);
    // Thẻ sản phẩm thêm đúng phiên bản đang đặt trước (có thể không phải phiên bản mặc định), với giá của phiên bản đó.
    const variant = {
      variantId: String(row.offer_variant_id),
      price: Number(row.offer_price),
      compareAtPrice: row.offer_compare_at_price === null ? null : Number(row.offer_compare_at_price),
      preorder: offer,
    };
    return [{ product: { ...product, ...variant }, variantName: String(row.offer_variant_name), isDefaultVariant: Boolean(row.offer_is_default), offer }];
  });
}
