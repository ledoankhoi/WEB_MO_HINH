import "server-only";
import { site } from "@/config/site";
import { amountDue } from "@/lib/preorder";
import { createAttempt } from "../repo/payment-attempts";
import { getBaseUrl } from "../request";
import { PAYMENT_TTL_MINUTES, buildPaymentUrl, vnpayConfig } from "./vnpay";

type PayableOrder = { id: string; code: string; total: number; depositAmount?: number; paymentStatus?: string };

// Bắt đầu một lượt thanh toán VNPay cho đơn: tạo lượt (mã mới mỗi lần) rồi trả URL chuyển khách tới cổng. Số tiền là phần
// khách cần trả lúc này (amountDue): tiền cọc nếu đơn đặt trước chưa cọc, phần còn lại nếu đã cọc, không thì cả đơn.
// null khi chưa cấu hình VNPay hoặc đơn không còn phải trả. Gọi trong Server Action (đọc header để lấy địa chỉ gốc).
export async function startVnpayPayment(order: PayableOrder, ipAddr: string): Promise<string | null> {
  const config = vnpayConfig();
  if (!config) return null;
  const amount = amountDue({ total: order.total, depositAmount: order.depositAmount ?? 0, paymentStatus: order.paymentStatus ?? "unpaid" });
  if (amount <= 0) return null;
  const now = Date.now();
  const attempt = await createAttempt({ id: order.id, code: order.code, total: amount }, "vnpay", PAYMENT_TTL_MINUTES * 60 * 1000, now);
  const base = await getBaseUrl(site.url);
  const deposit = order.paymentStatus !== "deposit_paid" && (order.depositAmount ?? 0) > 0;
  return buildPaymentUrl(config, {
    ref: attempt.ref,
    amount: attempt.amount,
    orderInfo: `${deposit ? "Dat coc" : "Thanh toan"} don hang ${order.code}`,
    ipAddr: ipAddr.includes(":") && !ipAddr.includes(".") ? "127.0.0.1" : ipAddr,
    returnUrl: `${base}/api/thanh-toan/vnpay/tra-ve`,
    now,
  });
}
