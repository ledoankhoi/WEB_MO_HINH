import "server-only";
import { confirmPaid, findAttempt, logCallback, markFailed, type ConfirmOutcome } from "../repo/payment-attempts";
import { queryTransaction, readResult, verifySignature, vnpayConfig } from "./vnpay";

// Xử lý kết quả VNPay gửi về, dùng chung cho IPN (máy chủ ↔ máy chủ) và trang trả về (trình duyệt).

export type IpnReply = { RspCode: "00" | "01" | "02" | "04" | "97" | "99"; Message: string };

const params = (url: URL) => Object.fromEntries([...url.searchParams].filter(([key]) => key.startsWith("vnp_")));

// IPN: chỉ đường này được đổi trạng thái khi chưa tra cứu lại. Thứ tự kiểm theo tài liệu VNPay: chữ ký → đơn → số tiền → trạng thái.
export async function handleIpn(url: URL): Promise<IpnReply> {
  const config = vnpayConfig();
  const query = params(url);
  const ref = query.vnp_TxnRef ?? "";
  if (!config) return { RspCode: "99", Message: "Not configured" };
  const signatureOk = verifySignature(query, config.hashSecret);
  let reply: IpnReply;
  try {
    reply = signatureOk ? await settle(query) : { RspCode: "97", Message: "Invalid signature" };
  } catch (error) {
    console.error("[vnpay] Lỗi xử lý IPN", ref, error);
    reply = { RspCode: "99", Message: "Unknown error" };
  }
  await logCallback({ gateway: "vnpay", kind: "ipn", ref, payload: query, signatureOk, result: reply.RspCode });
  return reply;
}

async function settle(query: Record<string, string>): Promise<IpnReply> {
  const result = readResult(query);
  const attempt = await findAttempt(result.ref);
  if (!attempt) return { RspCode: "01", Message: "Order not found" };
  if (result.amount !== attempt.amount) return { RspCode: "04", Message: "Invalid amount" };
  if (!result.success) {
    if (attempt.status !== "pending") return { RspCode: "02", Message: "Order already confirmed" };
    await markFailed(result.ref, result.responseCode);
    return { RspCode: "00", Message: "Confirm Success" };
  }
  const outcome = await confirmPaid(result.ref, { amount: result.amount, gatewayTxn: result.transactionNo, bankCode: result.bankCode, responseCode: result.responseCode });
  return replyFor(outcome);
}

function replyFor(outcome: ConfirmOutcome): IpnReply {
  if (outcome === "confirmed") return { RspCode: "00", Message: "Confirm Success" };
  if (outcome === "not_found") return { RspCode: "01", Message: "Order not found" };
  if (outcome === "amount") return { RspCode: "04", Message: "Invalid amount" };
  return { RspCode: "02", Message: "Order already confirmed" };
}

export type ReturnOutcome = { token: string | null; status: "paid" | "failed" | "pending" | "invalid"; responseCode: string };

// Trang trả về: kiểm chữ ký để hiển thị đúng, nhưng KHÔNG tin tham số trên URL để ghi "đã trả". Nếu cổng báo thành công
// mà IPN chưa tới (chạy trên máy: VNPay không gọi được localhost), máy chủ tra cứu lại (querydr) rồi mới ghi nhận.
export async function handleReturn(url: URL, ipAddr: string, fetcher: typeof fetch = fetch): Promise<ReturnOutcome> {
  const config = vnpayConfig();
  const query = params(url);
  const ref = query.vnp_TxnRef ?? "";
  const signatureOk = !!config && verifySignature(query, config.hashSecret);
  const attempt = ref ? await findAttempt(ref) : null;
  await logCallback({ gateway: "vnpay", kind: "return", ref, payload: query, signatureOk, result: "" });
  if (!config || !signatureOk || !attempt) return { token: attempt?.orderToken ?? null, status: "invalid", responseCode: "" };
  const result = readResult(query);
  if (attempt.status === "paid") return { token: attempt.orderToken, status: "paid", responseCode: "00" };
  if (!result.success) return { token: attempt.orderToken, status: "failed", responseCode: result.responseCode };

  const now = Date.now();
  const checked = await queryTransaction(config, { ref, createdAt: attempt.createdAt, ipAddr, now, requestId: `${now}${ref}`.slice(0, 32) }, fetcher);
  await logCallback({ gateway: "vnpay", kind: "query", ref, payload: checked ?? { error: "query failed" }, signatureOk: true, result: checked?.transactionStatus ?? "" });
  if (checked && checked.responseCode === "00" && checked.transactionStatus === "00") {
    const outcome = await confirmPaid(ref, { amount: checked.amount, gatewayTxn: checked.transactionNo, bankCode: checked.bankCode, responseCode: "00" });
    if (outcome === "confirmed" || outcome === "already" || outcome === "duplicate") return { token: attempt.orderToken, status: "paid", responseCode: "00" };
  }
  // Chưa xác minh được: trang đơn hiện "đang xác nhận"; IPN hoặc lần tra cứu sau sẽ ghi nhận.
  return { token: attempt.orderToken, status: "pending", responseCode: result.responseCode };
}
