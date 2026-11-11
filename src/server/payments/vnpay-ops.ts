import "server-only";
import { getDb } from "../db";
import { confirmPaid, markFailed } from "../repo/payment-attempts";
import { queryTransaction, refundTransaction, vnpayConfig } from "./vnpay";

// Thao tác VNPay phía cửa hàng (docs/ke-hoach/thanh-toan-va-van-chuyen.md, bước C6, C7):
// - hoàn tiền một đơn qua API (thay cho chuyển khoản hoàn tay);
// - đối soát lượt thanh toán treo (IPN bị lỡ, khách tắt trình duyệt trước khi quay về).
// Mỗi lần gọi VNPay đều ghi nguyên văn vào payment_callbacks (kind 'refund' / 'query').

type PaidAttempt = { ref: string; amount: number; gatewayTxn: string; createdAt: number; refunded: number };

async function log(kind: "refund" | "query", ref: string, payload: unknown, result: string): Promise<void> {
  try {
    const db = await getDb();
    await db.execute({
      sql: "INSERT INTO payment_callbacks (gateway, kind, ref, payload, signature_ok, result, created_at) VALUES ('vnpay', ?, ?, ?, true, ?, ?)",
      args: [kind, ref, JSON.stringify(payload).slice(0, 20_000), result.slice(0, 200), Date.now()],
    });
  } catch (error) {
    console.error("[vnpay] Không ghi được nhật ký", kind, ref, error);
  }
}

// Các lượt VNPay đã trả của đơn (mới nhất trước) kèm số đã hoàn qua API trên từng lượt.
async function paidAttempts(orderId: string): Promise<PaidAttempt[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT a.ref, a.amount, a.gateway_txn, a.created_at,
                 COALESCE((SELECT SUM((c.payload::json ->> 'amount')::bigint) FROM payment_callbacks c
                           WHERE c.gateway = 'vnpay' AND c.kind = 'refund' AND c.ref = a.ref AND c.result = '00'), 0) AS refunded
          FROM payment_attempts a WHERE a.order_id = ? AND a.gateway = 'vnpay' AND a.status = 'paid'
          ORDER BY a.paid_at DESC`,
    args: [orderId],
  });
  return result.rows.map((row) => ({
    ref: String(row.ref),
    amount: Number(row.amount),
    gatewayTxn: String(row.gateway_txn),
    createdAt: Number(row.created_at),
    refunded: Number(row.refunded),
  }));
}

// Số còn hoàn được qua VNPay của đơn (tổng đã trả qua VNPay trừ đã hoàn qua API).
export async function vnpayRefundable(orderId: string): Promise<number> {
  return (await paidAttempts(orderId)).reduce((sum, attempt) => sum + attempt.amount - attempt.refunded, 0);
}

// Chia số tiền cần hoàn cho các lượt đã trả (lượt mới nhất trước). Hàm thuần, để test.
export function planRefund(attempts: Pick<PaidAttempt, "ref" | "amount" | "refunded">[], amount: number): { ref: string; amount: number; full: boolean }[] | null {
  let remaining = amount;
  const plan: { ref: string; amount: number; full: boolean }[] = [];
  for (const attempt of attempts) {
    if (remaining <= 0) break;
    const left = attempt.amount - attempt.refunded;
    if (left <= 0) continue;
    const part = Math.min(left, remaining);
    // "Toàn phần" chỉ khi hoàn hết lượt và lượt chưa từng hoàn một phần (VNPay mã 04).
    plan.push({ ref: attempt.ref, amount: part, full: part === attempt.amount && attempt.refunded === 0 });
    remaining -= part;
  }
  return remaining > 0 ? null : plan;
}

export type RefundResult = { ok: true; refunded: number } | { ok: false; refunded: number; message: string };

// Hoàn `amount` cho đơn qua VNPay. CHỈ gọi cổng, không ghi payments / đổi trạng thái đơn: tầng gọi (L14, trả hàng) ghi nhận
// sau khi ok. Lỗi giữa chừng (đã hoàn được một phần lượt) thì trả số đã hoàn để tầng gọi xử lý và báo kế toán.
export async function refundOrderViaVnpay(orderId: string, amount: number, by: { name: string; ipAddr: string }, fetcher: typeof fetch = fetch): Promise<RefundResult> {
  const config = vnpayConfig();
  if (!config) return { ok: false, refunded: 0, message: "Chưa cấu hình VNPay." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, refunded: 0, message: "Số tiền hoàn không hợp lệ." };
  const attempts = await paidAttempts(orderId);
  const plan = planRefund(attempts, amount);
  if (!plan) return { ok: false, refunded: 0, message: "Số tiền hoàn lớn hơn số khách đã trả qua VNPay." };
  let refunded = 0;
  for (const step of plan) {
    const attempt = attempts.find((item) => item.ref === step.ref)!;
    const now = Date.now();
    const reply = await refundTransaction(
      config,
      { ref: step.ref, amount: step.amount, full: step.full, transactionNo: attempt.gatewayTxn, transactionDate: attempt.createdAt, createBy: by.name, ipAddr: by.ipAddr, now, requestId: `${now}R${step.ref}`.slice(0, 32) },
      fetcher,
    );
    await log("refund", step.ref, { amount: step.amount, full: step.full, reply }, reply?.responseCode ?? "no_reply");
    if (reply?.responseCode !== "00") {
      return { ok: false, refunded, message: reply ? `VNPay: ${reply.message}` : "Không gọi được VNPay. Tra cứu lại trước khi gửi lần nữa." };
    }
    refunded += step.amount;
  }
  return { ok: true, refunded };
}

// Đối soát lượt treo: lượt VNPay còn "pending" đã quá hạn thanh toán vài phút (IPN lẽ ra đã về) và chưa quá 7 ngày.
// Tra cứu từng lượt: thành công → ghi nhận như IPN; VNPay báo lỗi / không có giao dịch → đánh dấu thất bại; còn lại để lần sau.
export async function reconcilePendingVnpay(now: number, fetcher: typeof fetch = fetch, limit = 30): Promise<{ checked: number; paid: number; failed: number }> {
  const config = vnpayConfig();
  if (!config) return { checked: 0, paid: 0, failed: 0 };
  const db = await getDb();
  const rows = (
    await db.execute({
      sql: `SELECT ref, created_at FROM payment_attempts WHERE gateway = 'vnpay' AND status = 'pending' AND expires_at < ? AND created_at > ?
            ORDER BY created_at LIMIT ?`,
      args: [now - 5 * 60 * 1000, now - 7 * 24 * 60 * 60 * 1000, limit],
    })
  ).rows;
  let paid = 0;
  let failed = 0;
  for (const row of rows) {
    const ref = String(row.ref);
    const checked = await queryTransaction(config, { ref, createdAt: Number(row.created_at), ipAddr: "127.0.0.1", now, requestId: `${now}Q${ref}`.slice(0, 32) }, fetcher);
    await log("query", ref, checked ?? { error: "query failed" }, checked?.transactionStatus ?? "no_reply");
    if (!checked) continue;
    if (checked.responseCode === "00" && checked.transactionStatus === "00") {
      const outcome = await confirmPaid(ref, { amount: checked.amount, gatewayTxn: checked.transactionNo, bankCode: checked.bankCode, responseCode: "00" });
      if (outcome !== "amount" && outcome !== "not_found") paid++;
    } else if (checked.responseCode === "91" || (checked.responseCode === "00" && checked.transactionStatus === "02")) {
      await markFailed(ref, checked.transactionStatus || checked.responseCode);
      failed++;
    }
  }
  return { checked: rows.length, paid, failed };
}
