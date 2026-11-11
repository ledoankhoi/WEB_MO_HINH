import "server-only";
import { getDb, isConstraintError, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";
import { applyOrderAction } from "./orders";

// Lượt thanh toán online (bảng payment_attempts) và nhật ký kết quả cổng gửi về (payment_callbacks).
// Docs: docs/ke-hoach/thanh-toan-va-van-chuyen.md mục 4.

export type Gateway = "vnpay" | "momo";
export type AttemptStatus = "pending" | "paid" | "failed";

export type PaymentAttempt = {
  id: string;
  orderId: string;
  orderCode: string;
  orderToken: string;
  gateway: Gateway;
  ref: string;
  amount: number;
  status: AttemptStatus;
  gatewayTxn: string;
  bankCode: string;
  responseCode: string;
  expiresAt: number;
  paidAt: number | null;
  createdAt: number;
};

const SELECT = `SELECT a.*, o.code AS order_code, o.token AS order_token FROM payment_attempts a JOIN orders o ON o.id = a.order_id`;

function toAttempt(row: Row): PaymentAttempt {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    orderCode: String(row.order_code),
    orderToken: String(row.order_token),
    gateway: row.gateway === "momo" ? "momo" : "vnpay",
    ref: String(row.ref),
    amount: Number(row.amount),
    status: String(row.status) as AttemptStatus,
    gatewayTxn: String(row.gateway_txn),
    bankCode: String(row.bank_code),
    responseCode: String(row.response_code),
    expiresAt: Number(row.expires_at),
    paidAt: row.paid_at === null ? null : Number(row.paid_at),
    createdAt: Number(row.created_at),
  };
}

// Mã gửi cổng: mã đơn + 6 ký tự ngẫu nhiên (chữ hoa, số), để thanh toán lại vẫn có mã mới duy nhất.
function attemptRef(orderCode: string): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join("");
  return `${orderCode}${random}`;
}

export async function createAttempt(order: { id: string; code: string; total: number }, gateway: Gateway, ttlMs: number, now: number): Promise<PaymentAttempt> {
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const ref = attemptRef(order.code);
    try {
      await db.execute({
        sql: `INSERT INTO payment_attempts (id, order_id, gateway, ref, amount, status, expires_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        args: [id, order.id, gateway, ref, order.total, now + ttlMs, now, now],
      });
      return (await findAttempt(ref))!;
    } catch (error) {
      if (!isConstraintError(error)) throw error;
    }
  }
  throw new Error("Không tạo được mã thanh toán duy nhất");
}

export async function findAttempt(ref: string): Promise<PaymentAttempt | null> {
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT} WHERE a.ref = ?`, args: [ref] });
  return result.rows[0] ? toAttempt(result.rows[0]) : null;
}

export async function listAttemptsForOrder(orderId: string): Promise<PaymentAttempt[]> {
  const db = await getDb();
  const result = await db.execute({ sql: `${SELECT} WHERE a.order_id = ? ORDER BY a.created_at DESC`, args: [orderId] });
  return result.rows.map(toAttempt);
}

// Ghi nguyên văn kết quả cổng gửi về. Không bao giờ ném lỗi (nhật ký không được làm hỏng việc xác nhận).
export async function logCallback(entry: { gateway: Gateway; kind: "ipn" | "return" | "query"; ref: string; payload: unknown; signatureOk: boolean; result: string }): Promise<void> {
  try {
    const db = await getDb();
    await db.execute({
      sql: "INSERT INTO payment_callbacks (gateway, kind, ref, payload, signature_ok, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [entry.gateway, entry.kind, entry.ref.slice(0, 100), JSON.stringify(entry.payload).slice(0, 20_000), entry.signatureOk, entry.result.slice(0, 200), Date.now()],
    });
  } catch (error) {
    console.error("[payment] Không ghi được nhật ký callback", error);
  }
}

export type ConfirmOutcome = "confirmed" | "already" | "duplicate" | "amount" | "not_found";

const SYSTEM = (summary: string, detail: Record<string, unknown>): AuditEntry => ({
  actor: { id: null, role: "system" },
  action: "payment.gateway_paid",
  entity: "orders",
  summary,
  detail,
});

// Lượt thanh toán này trả khoản nào của đơn, theo trạng thái hiện tại và số tiền của lượt (lúc tạo lượt là amountDue):
// cọc (đơn chưa trả, số tiền = tiền cọc), cả đơn (chưa trả, = tổng), phần còn lại (đã cọc, = tổng − cọc).
// "duplicate": đơn đã có khoản này từ lượt khác (khách trả hai lần); "amount": số tiền không khớp khoản nào.
export function attemptCovers(
  order: { paymentStatus: string; total: number; depositAmount: number },
  amount: number,
): { kind: "deposit" | "charge"; from: "unpaid" | "deposit_paid"; to: "deposit_paid" | "paid" } | "duplicate" | "amount" {
  if (order.paymentStatus === "unpaid") {
    if (order.depositAmount > 0 && amount === order.depositAmount) return { kind: "deposit", from: "unpaid", to: "deposit_paid" };
    return amount === order.total ? { kind: "charge", from: "unpaid", to: "paid" } : "amount";
  }
  if (order.paymentStatus === "deposit_paid") {
    if (amount === order.total - order.depositAmount) return { kind: "charge", from: "deposit_paid", to: "paid" };
    return amount === order.depositAmount ? "duplicate" : "amount";
  }
  return "duplicate";
}

// Ghi nhận cổng báo đã thu tiền. Idempotent: gọi lặp (IPN gửi lại, khách quay về sau IPN) không ghi thêm gì.
// - Đơn còn chờ / đang xử lý: chạy L15 (đã nhận cọc) hoặc L2 (đã thu tiền), ghi payments, gửi thư như kế toán bấm tay.
// - Đơn đã huỷ (khách trả sau khi đơn bị huỷ): vẫn ghi nhận tiền để đơn rơi vào "Chờ hoàn tiền" (L14), không bỏ qua.
// - Đơn đã có khoản này từ lượt khác: "duplicate", khách trả hai lần, kế toán phải hoàn một lần (ghi ở nhật ký).
export async function confirmPaid(ref: string, paid: { amount: number; gatewayTxn: string; bankCode: string; responseCode: string }): Promise<ConfirmOutcome> {
  const attempt = await findAttempt(ref);
  if (!attempt) return "not_found";
  if (paid.amount !== attempt.amount) return "amount";
  const db = await getDb();
  const now = Date.now();
  const marked = await db.execute({
    sql: `UPDATE payment_attempts SET status = 'paid', gateway_txn = ?, bank_code = ?, response_code = ?, paid_at = ?, updated_at = ?
          WHERE ref = ? AND status <> 'paid'`,
    args: [paid.gatewayTxn, paid.bankCode, paid.responseCode, now, now, ref],
  });
  const order = (
    await db.execute({ sql: "SELECT id, code, status, payment_status, total, deposit_amount FROM orders WHERE id = ?", args: [attempt.orderId] })
  ).rows[0];
  if (!order) return "not_found";
  // Tổng và tiền cọc không đổi sau khi đặt; lượt phải khớp đúng khoản đơn đang chờ.
  const covers = attemptCovers({ paymentStatus: String(order.payment_status), total: Number(order.total), depositAmount: Number(order.deposit_amount) }, attempt.amount);
  if (covers === "duplicate") return marked.rowsAffected > 0 ? "duplicate" : "already";
  if (covers === "amount") return "amount";

  const label = attempt.gateway === "vnpay" ? "VNPay" : "MoMo";
  const audit = SYSTEM(`${label} báo đã ${covers.kind === "deposit" ? "nhận cọc" : "thanh toán"} đơn ${order.code}`, { ref, gatewayTxn: paid.gatewayTxn, amount: paid.amount });
  if (order.status === "cancelled") {
    const still = "id = ? AND status = 'cancelled' AND payment_status = ?";
    const results = await db.batch([
      { sql: "SELECT id FROM orders WHERE id = ? FOR UPDATE", args: [attempt.orderId] },
      {
        sql: `INSERT INTO order_events (order_id, field, from_value, to_value, note, created_at)
              SELECT id, 'payment_status', payment_status, ?, ?, ? FROM orders WHERE ${still}`,
        args: [covers.to, `${label} (đơn đã huỷ)`, now, attempt.orderId, covers.from],
      },
      {
        sql: `INSERT INTO payments (id, order_id, kind, method, amount, reference, gateway_txn, created_at)
              SELECT ?, id, ?, payment_method, ?, ?, ?, ? FROM orders WHERE ${still}`,
        args: [newId(), covers.kind, attempt.amount, `${label} ${ref}`, paid.gatewayTxn, now, attempt.orderId, covers.from],
      },
      withAudit({ sql: `UPDATE orders SET payment_status = ?, updated_at = ? WHERE ${still}`, args: [covers.to, now, attempt.orderId, covers.from] }, audit),
    ]);
    return results[results.length - 1].rowsAffected > 0 ? "confirmed" : "already";
  }
  const changed = await applyOrderAction(attempt.orderId, covers.kind === "deposit" ? "mark_deposit" : "mark_paid", audit, { reference: `${label} ${ref}` });
  if (changed) {
    await db.execute({ sql: "UPDATE payments SET gateway_txn = ? WHERE order_id = ? AND kind = ?", args: [paid.gatewayTxn, attempt.orderId, covers.kind] });
  }
  return changed ? "confirmed" : "already";
}

// Cổng báo giao dịch không thành công (khách huỷ, hết hạn, sai OTP...). Đơn giữ nguyên, khách thanh toán lại được.
export async function markFailed(ref: string, responseCode: string): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE payment_attempts SET status = 'failed', response_code = ?, updated_at = ? WHERE ref = ? AND status = 'pending'",
    args: [responseCode.slice(0, 10), Date.now(), ref],
  });
}
