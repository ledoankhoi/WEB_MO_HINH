import "server-only";
import { site } from "@/config/site";
import { getDb } from "../db";
import type { AuditEntry } from "./audit";
import { applyOrderAction } from "./orders";

// Chuyển khoản ngân hàng (docs/ke-hoach/thanh-toan-va-van-chuyen.md): khách báo đã chuyển, danh sách chờ đối soát cho kế
// toán, và tác vụ định kỳ nhắc khách / tự huỷ đơn quá hạn trả trước. Tiền vẫn do kế toán ghi nhận (L2, L15) sau khi
// thấy trong sổ ngân hàng; khách bấm "đã chuyển" chỉ là lời báo, không đổi trạng thái thanh toán.

const HOUR = 60 * 60 * 1000;

// Đơn đang chờ khoản trả trước đầu tiên (khớp awaitsPrepayment ở src/lib/bank-transfer.ts).
const AWAITING_SQL = "o.status = 'pending' AND o.payment_status = 'unpaid' AND (o.payment_method IN ('bank', 'vnpay') OR o.deposit_amount > 0)";

export type TransferClaim = { note: string; createdAt: number };

export async function claimTransfer(orderId: string, note: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "INSERT INTO transfer_claims (order_id, note, created_at) VALUES (?, ?, ?)", args: [orderId, note, Date.now()] });
}

export async function latestClaim(orderId: string): Promise<TransferClaim | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT note, created_at FROM transfer_claims WHERE order_id = ? ORDER BY created_at DESC LIMIT 1", args: [orderId] })).rows[0];
  return row ? { note: String(row.note), createdAt: Number(row.created_at) } : null;
}

export async function countRecentClaims(orderId: string, since: number): Promise<number> {
  const db = await getDb();
  return Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM transfer_claims WHERE order_id = ? AND created_at > ?", args: [orderId, since] })).rows[0]?.n ?? 0);
}

export type AwaitingTransfer = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  total: number;
  depositAmount: number;
  createdAt: number;
  claim: TransferClaim | null;
};

// Đơn chờ chuyển khoản (không gồm VNPay: cổng tự báo kết quả), đơn khách đã báo chuyển lên đầu.
export async function listAwaitingTransfers(limit = 200): Promise<AwaitingTransfer[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT o.id, o.code, o.customer_name, o.customer_phone, o.payment_method, o.total, o.deposit_amount, o.created_at,
                 c.note AS claim_note, c.created_at AS claim_at
          FROM orders o
          LEFT JOIN LATERAL (SELECT note, created_at FROM transfer_claims t WHERE t.order_id = o.id ORDER BY created_at DESC LIMIT 1) c ON true
          WHERE ${AWAITING_SQL} AND o.payment_method <> 'vnpay'
          ORDER BY (c.created_at IS NULL), c.created_at DESC, o.created_at
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    customerName: String(row.customer_name),
    customerPhone: String(row.customer_phone),
    paymentMethod: String(row.payment_method),
    total: Number(row.total),
    depositAmount: Number(row.deposit_amount),
    createdAt: Number(row.created_at),
    claim: row.claim_at === null || row.claim_at === undefined ? null : { note: String(row.claim_note), createdAt: Number(row.claim_at) },
  }));
}

// Nhắc khách (một lần mỗi đơn) khi đã qua mốc nhắc mà chưa trả, còn trong hạn giữ hàng. Trả về số thư đã gửi.
export async function remindUnpaidTransfers(now: number, limit = 50): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT o.id FROM orders o
          WHERE ${AWAITING_SQL} AND o.customer_email <> '' AND o.created_at <= ?::bigint
            AND o.created_at > ?::bigint - (CASE WHEN o.payment_method = 'vnpay' THEN ?::bigint ELSE ?::bigint END)
            AND NOT EXISTS (SELECT 1 FROM transfer_claims t WHERE t.order_id = o.id)
            AND NOT EXISTS (SELECT 1 FROM email_outbox m WHERE m.ref = o.id || ':transfer_reminder')
          ORDER BY o.created_at LIMIT ?`,
    args: [now - site.payment.transferRemindHours * HOUR, now, site.payment.onlineHoldHours * HOUR, site.payment.transferHoldHours * HOUR, limit],
  });
  const { notifyOrderEvent } = await import("../email/order-mails");
  for (const row of result.rows) await notifyOrderEvent(String(row.id), "transfer_reminder");
  return result.rows.length;
}

const SYSTEM: AuditEntry = { actor: { id: null, role: "system" }, action: "order.expire", entity: "orders", summary: "Tự huỷ đơn quá hạn trả trước" };

// Tự huỷ đơn quá hạn trả trước (L13, trả hàng giữ về kho, trả lượt mã giảm giá), gửi thư "expired". Bỏ qua đơn khách đã
// báo chuyển khoản (kế toán quyết định) và đơn đang có lượt VNPay còn hạn (khách đang trả). Trả về mã các đơn đã huỷ.
export async function expireUnpaidOrders(now: number, limit = 50): Promise<string[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT o.id, o.code FROM orders o
          WHERE ${AWAITING_SQL}
            AND o.created_at < ?::bigint - (CASE WHEN o.payment_method = 'vnpay' THEN ?::bigint ELSE ?::bigint END)
            AND NOT EXISTS (SELECT 1 FROM transfer_claims t WHERE t.order_id = o.id)
            AND NOT EXISTS (SELECT 1 FROM payment_attempts a WHERE a.order_id = o.id AND a.status = 'pending' AND a.expires_at > ?::bigint)
          ORDER BY o.created_at LIMIT ?`,
    args: [now, site.payment.onlineHoldHours * HOUR, site.payment.transferHoldHours * HOUR, now, limit],
  });
  const cancelled: string[] = [];
  for (const row of result.rows) {
    const code = String(row.code);
    const ok = await applyOrderAction(String(row.id), "cancel", { ...SYSTEM, summary: `Tự huỷ đơn ${code}: quá hạn trả trước` }, { mail: "expired" });
    if (ok) cancelled.push(code);
  }
  return cancelled;
}
