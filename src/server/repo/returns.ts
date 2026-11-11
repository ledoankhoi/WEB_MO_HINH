import "server-only";
import { RETURN_REASONS, returnDeadline, type ReturnReason, type ReturnStatus } from "@/lib/returns";
import { isPaymentMethod } from "@/lib/catalog";
import type { StockDocumentStatus } from "@/lib/stock";
import type { Order } from "@/lib/types";
import { getDb, isConstraintError, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";
import { changeDocumentStatus, createDocument, saveDraft } from "./stock-documents";

// Yêu cầu trả hàng (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 4; luồng ở src/lib/returns.ts).

export type ReturnItem = { orderItemId: number; variantId: string; name: string; unitPrice: number; quantity: number };

export type ReturnRequest = {
  id: string;
  code: string;
  orderId: string;
  orderCode: string;
  orderToken: string;
  orderTotal: number;
  paymentMethod: Order["paymentMethod"];
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  status: ReturnStatus;
  reason: ReturnReason;
  note: string;
  images: string[];
  refundAccount: string;
  refundAmount: number;
  staffNote: string;
  documentId: string | null;
  documentCode: string | null;
  documentStatus: StockDocumentStatus | null;
  decidedByName: string | null;
  decidedAt: number | null;
  refundedAt: number | null;
  refundReference: string;
  createdAt: number;
  items: ReturnItem[];
};

const SELECT = `SELECT r.*, o.code AS order_code, o.token AS order_token, o.total AS order_total, o.payment_method,
                       o.customer_name, o.customer_email, o.customer_phone,
                       d.code AS document_code, d.status AS document_status, u.name AS decided_by_name
                FROM return_requests r
                JOIN orders o ON o.id = r.order_id
                LEFT JOIN stock_documents d ON d.id = r.document_id
                LEFT JOIN users u ON u.id = r.decided_by`;

function parseImages(value: unknown): string[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function toRequest(row: Row, items: ReturnItem[]): ReturnRequest {
  return {
    id: String(row.id),
    code: String(row.code),
    orderId: String(row.order_id),
    orderCode: String(row.order_code),
    orderToken: String(row.order_token),
    orderTotal: Number(row.order_total),
    paymentMethod: isPaymentMethod(row.payment_method) ? row.payment_method : "cod",
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email ?? ""),
    customerPhone: String(row.customer_phone),
    status: String(row.status) as ReturnStatus,
    reason: (Object.hasOwn(RETURN_REASONS, String(row.reason)) ? String(row.reason) : "defective") as ReturnReason,
    note: String(row.note),
    images: parseImages(row.images),
    refundAccount: String(row.refund_account),
    refundAmount: Number(row.refund_amount),
    staffNote: String(row.staff_note),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentCode: row.document_code === null ? null : String(row.document_code),
    documentStatus: row.document_status === null ? null : (String(row.document_status) as StockDocumentStatus),
    decidedByName: row.decided_by_name === null ? null : String(row.decided_by_name),
    decidedAt: row.decided_at === null ? null : Number(row.decided_at),
    refundedAt: row.refunded_at === null ? null : Number(row.refunded_at),
    refundReference: String(row.refund_reference),
    createdAt: Number(row.created_at),
    items,
  };
}

const toItem = (row: Row): ReturnItem => ({
  orderItemId: Number(row.order_item_id),
  variantId: String(row.variant_id),
  name: String(row.name),
  unitPrice: Number(row.unit_price),
  quantity: Number(row.quantity),
});

async function withItems(rows: Row[]): Promise<ReturnRequest[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((row) => String(row.id));
  const items = await db.execute({
    sql: `SELECT * FROM return_request_items WHERE request_id IN (${ids.map(() => "?").join(", ")}) ORDER BY order_item_id`,
    args: ids,
  });
  const byRequest = new Map<string, ReturnItem[]>();
  for (const row of items.rows) {
    const list = byRequest.get(String(row.request_id)) ?? [];
    list.push(toItem(row));
    byRequest.set(String(row.request_id), list);
  }
  return rows.map((row) => toRequest(row, byRequest.get(String(row.id)) ?? []));
}

export async function findReturnRequest(id: string): Promise<ReturnRequest | null> {
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT} WHERE r.id = ?`, args: [id] });
  return (await withItems(result.rows))[0] ?? null;
}

// Mọi yêu cầu của một đơn, mới nhất trước.
export async function listReturnsForOrder(orderId: string): Promise<ReturnRequest[]> {
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT} WHERE r.order_id = ? ORDER BY r.created_at DESC`, args: [orderId] });
  return withItems(result.rows);
}

export async function listReturnRequests(query: { status?: ReturnStatus | null; page: number; pageSize: number }): Promise<{ items: ReturnRequest[]; total: number }> {
  const db = await getDb();
  const where = query.status ? "WHERE r.status = ?" : "";
  const args = query.status ? [query.status] : [];
  const [rows, count] = await db.batch([
    { sql: `${SELECT} ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, args: [...args, query.pageSize, (query.page - 1) * query.pageSize] },
    { sql: `SELECT COUNT(*) AS n FROM return_requests r ${where}`, args },
  ]);
  return { items: await withItems(rows.rows), total: Number(count.rows[0]?.n ?? 0) };
}

// Lúc giao thành công gần nhất (L7), hoặc null nếu đơn chưa từng giao xong.
export async function deliveredAt(orderId: string): Promise<number | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT MAX(created_at) AS at FROM order_events WHERE order_id = ? AND field = 'shipping_status' AND to_value = 'delivered'",
    args: [orderId],
  });
  const at = result.rows[0]?.at;
  return at === null || at === undefined ? null : Number(at);
}

export type ReturnEligibility = { ok: true; deadline: number } | { ok: false; message: string; deadline: number | null };

// Đơn có trả hàng được không, ở thời điểm `now` (gọi trong Server Action, Route Handler hoặc truyền đồng hồ CSDL).
export async function returnEligibility(order: Pick<Order, "id" | "shippingStatus" | "paymentStatus">, now: number): Promise<ReturnEligibility> {
  if (order.shippingStatus !== "delivered") return { ok: false, message: "Chỉ gửi yêu cầu trả hàng sau khi đơn đã giao thành công.", deadline: null };
  const at = await deliveredAt(order.id);
  const deadline = at === null ? null : returnDeadline(at);
  if (order.paymentStatus !== "paid") return { ok: false, message: "Đơn chưa ghi nhận thanh toán nên chưa xử lý trả hàng được. Vui lòng liên hệ cửa hàng.", deadline };
  if (deadline === null || now > deadline) return { ok: false, message: "Đã quá hạn gửi yêu cầu trả hàng của đơn này.", deadline };
  const db = await getDb();
  const open = await db.execute({
    sql: "SELECT 1 FROM return_requests WHERE order_id = ? AND status IN ('requested', 'approved', 'refunded') LIMIT 1",
    args: [order.id],
  });
  if (open.rows.length > 0) return { ok: false, message: "Đơn này đã có yêu cầu trả hàng.", deadline };
  return { ok: true, deadline };
}

export type NewReturn = {
  order: Order;
  reason: ReturnReason;
  note: string;
  refundAccount: string;
  refundAmount: number;
  picks: Map<number, number>;
  images: string[];
};

// Ghi yêu cầu mới. Trả về null khi đơn vừa có yêu cầu khác (chỉ mục duy nhất) hoặc không còn đã giao + đã thu tiền.
export async function createReturnRequest(input: NewReturn): Promise<{ id: string; code: string } | null> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  const count = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM return_requests WHERE order_id = ?", args: [input.order.id] })).rows[0]?.n ?? 0);
  const code = `TH-${input.order.code}${count > 0 ? `-${count + 1}` : ""}`;
  const statements: InStatement[] = [
    { sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [input.order.id] },
    {
      sql: `INSERT INTO return_requests (id, code, order_id, status, reason, note, images, refund_account, refund_amount, created_at, updated_at)
            SELECT ?, ?, id, 'requested', ?, ?, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND shipping_status = 'delivered' AND payment_status = 'paid'`,
      args: [id, code, input.reason, input.note, JSON.stringify(input.images), input.refundAccount, input.refundAmount, now, now, input.order.id],
    },
  ];
  for (const item of input.order.items) {
    const qty = input.picks.get(item.lineId);
    if (!qty) continue;
    const name = `${item.name}${item.variantName && item.variantName !== "Bản thường" ? ` (${item.variantName})` : ""}`;
    statements.push({
      sql: `INSERT INTO return_request_items (request_id, order_item_id, variant_id, name, unit_price, quantity)
            SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM return_requests WHERE id = ?)`,
      args: [id, item.lineId, item.variantId, name, item.unitPrice, qty, id],
    });
  }
  try {
    const results = await db.batch(statements);
    return results[1].rowsAffected > 0 ? { id, code } : null;
  } catch (error) {
    if (isConstraintError(error)) return null;
    throw error;
  }
}

// Khách huỷ yêu cầu còn chờ duyệt (xác thực bằng token đơn ở tầng gọi).
export async function cancelReturnRequest(id: string, orderId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: "UPDATE return_requests SET status = 'cancelled', updated_at = ? WHERE id = ? AND order_id = ? AND status = 'requested'",
    args: [Date.now(), id, orderId],
  });
  return result.rowsAffected > 0;
}

// Duyệt (chốt số tiền hoàn) hoặc từ chối yêu cầu đang chờ.
export async function decideReturnRequest(
  id: string,
  decision: { approve: true; amount: number; staffNote: string } | { approve: false; staffNote: string },
  audit: AuditEntry,
): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const statement = decision.approve
    ? {
        sql: `UPDATE return_requests SET status = 'approved', refund_amount = ?, staff_note = ?, decided_by = ?, decided_at = ?, updated_at = ?
              WHERE id = ? AND status = 'requested' AND ? <= (SELECT total FROM orders WHERE orders.id = return_requests.order_id)`,
        args: [decision.amount, decision.staffNote, audit.actor.id, now, now, id, decision.amount],
      }
    : {
        sql: `UPDATE return_requests SET status = 'rejected', staff_note = ?, decided_by = ?, decided_at = ?, updated_at = ?
              WHERE id = ? AND status = 'requested'`,
        args: [decision.staffNote, audit.actor.id, now, now, id],
      };
  const result = await db.execute(withAudit(statement, audit));
  return result.rowsAffected > 0;
}

// Lập phiếu nhập hàng trả (nháp) gắn đơn cho yêu cầu đã duyệt: mỗi biến thể một dòng, vào vị trí cách ly. Kho kiểm hàng
// thực nhận, sửa số nếu cần rồi ghi sổ như mọi phiếu (luật kiểm tra số đã giao ở postDocument). Chỉ lập khi yêu cầu chưa
// có phiếu, hoặc phiếu cũ đã huỷ. Trả về id phiếu, hoặc lý do không lập được.
export async function createReturnDocument(id: string, audit: AuditEntry): Promise<{ ok: true; documentId: string } | { ok: false; message: string }> {
  const request = await findReturnRequest(id);
  if (!request || request.status !== "approved") return { ok: false, message: "Chỉ lập phiếu cho yêu cầu đã duyệt." };
  if (request.documentId && request.documentStatus !== "cancelled") return { ok: false, message: `Yêu cầu đã có phiếu ${request.documentCode}.` };
  const db = await getDb();
  const quarantine = String((await db.execute("SELECT id FROM locations WHERE type = 'quarantine' AND is_active ORDER BY code LIMIT 1")).rows[0]?.id ?? "");
  if (!quarantine) return { ok: false, message: "Kho chưa có vị trí cách ly đang dùng." };

  const totals = new Map<string, number>();
  for (const item of request.items) totals.set(item.variantId, (totals.get(item.variantId) ?? 0) + item.quantity);
  const documentId = await createDocument("return", { ...audit, action: "stock_document.create", entity: "stock_document", summary: `Phiếu hàng trả cho ${request.code}` });
  await saveDraft(documentId, {
    supplierId: null,
    orderId: request.orderId,
    reasonCode: "",
    reference: request.code,
    note: `Khách trả hàng theo yêu cầu ${request.code}`,
    expectedAt: null,
    lines: [...totals].map(([variantId, qty]) => ({
      variantId,
      locationId: quarantine,
      toLocationId: null,
      qtyExpected: qty,
      qty,
      qtyQuarantined: null,
      systemQty: null,
      unitCost: null,
      note: "",
    })),
  });
  const linked = await db.execute({
    sql: `UPDATE return_requests SET document_id = ?, updated_at = ? WHERE id = ? AND status = 'approved'
            AND (document_id IS NULL OR EXISTS (SELECT 1 FROM stock_documents d WHERE d.id = return_requests.document_id AND d.status = 'cancelled'))`,
    args: [documentId, Date.now(), id],
  });
  if (linked.rowsAffected === 0) {
    // Hai người bấm cùng lúc: bỏ phiếu thừa.
    await changeDocumentStatus(documentId, "cancel", { ...audit, action: "stock_document.cancel", entity: "stock_document", summary: "Huỷ phiếu hàng trả lập trùng" });
    return { ok: false, message: "Yêu cầu vừa được lập phiếu bởi người khác." };
  }
  return { ok: true, documentId };
}

// Ghi nhận đã hoàn tiền: chỉ khi yêu cầu đã duyệt và phiếu hàng trả đã ghi sổ (hàng đã về kho). Ghi một dòng hoàn tiền
// vào payments (đúng số đã duyệt); hoàn đủ tổng đơn thì đơn chuyển "Đã hoàn tiền". Cùng một giao dịch.
export async function recordReturnRefund(id: string, reference: string, audit: AuditEntry): Promise<{ ok: true } | { ok: false; message: string }> {
  const request = await findReturnRequest(id);
  if (!request || request.status !== "approved") return { ok: false, message: "Yêu cầu không ở trạng thái chờ hoàn tiền." };
  if (request.documentStatus !== "posted") return { ok: false, message: "Phiếu hàng trả chưa ghi sổ: kho cần nhận hàng về trước khi hoàn tiền." };
  if (request.refundAmount <= 0) return { ok: false, message: "Số tiền hoàn bằng 0." };
  const db = await getDb();
  const now = Date.now();
  const ready = `EXISTS (SELECT 1 FROM return_requests r JOIN stock_documents d ON d.id = r.document_id
                         WHERE r.id = ? AND r.status = 'approved' AND d.status = 'posted')`;
  const full = "payment_status = 'paid' AND total <= ?";
  const statements: InStatement[] = [
    { sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [request.orderId] },
    {
      sql: `INSERT INTO payments (id, order_id, kind, method, amount, reference, confirmed_by, created_at)
            SELECT ?, id, 'refund', payment_method, ?, ?, ?, ? FROM orders WHERE id = ? AND ${ready}`,
      args: [newId(), request.refundAmount, reference || request.code, audit.actor.id, now, request.orderId, id],
    },
    {
      sql: `INSERT INTO order_events (order_id, field, from_value, to_value, note, actor_id, created_at)
            SELECT id, 'payment_status', payment_status, 'refunded', ?, ?, ? FROM orders WHERE id = ? AND ${full} AND ${ready}`,
      args: [request.code, audit.actor.id, now, request.orderId, request.refundAmount, id],
    },
    {
      sql: `UPDATE orders SET payment_status = 'refunded', updated_at = ? WHERE id = ? AND ${full} AND ${ready}`,
      args: [now, request.orderId, request.refundAmount, id],
    },
    withAudit(
      {
        sql: `UPDATE return_requests SET status = 'refunded', refunded_by = ?, refunded_at = ?, refund_reference = ?, updated_at = ?
              WHERE id = ? AND status = 'approved' AND EXISTS (SELECT 1 FROM stock_documents d WHERE d.id = return_requests.document_id AND d.status = 'posted')`,
        args: [audit.actor.id, now, reference, now, id],
      },
      audit,
    ),
  ];
  try {
    const results = await db.batch(statements);
    return results[results.length - 1].rowsAffected > 0 ? { ok: true } : { ok: false, message: "Yêu cầu vừa được xử lý bởi người khác." };
  } catch (error) {
    // payments chỉ có một dòng hoàn tiền mỗi đơn: đơn đã được hoàn tiền theo đường khác.
    if (isConstraintError(error)) return { ok: false, message: "Đơn này đã có khoản hoàn tiền." };
    throw error;
  }
}


// Đồng hồ CSDL, để trang dựng được mà không gọi Date.now() (CLAUDE.md).
export async function databaseNow(): Promise<number> {
  const db = await getDb();
  return Number((await db.execute("SELECT (extract(epoch FROM now()) * 1000)::bigint AS now")).rows[0]?.now ?? 0);
}
