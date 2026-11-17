// Hạn trả trước của đơn (chuyển khoản, VNPay, cọc đặt trước), dùng chung cho trang khách, quản trị và tác vụ định kỳ.
// Cấu hình ở site.payment (src/config/site.ts).
import { site } from "@/config/site";

const HOUR = 60 * 60 * 1000;

type Payable = { paymentMethod: string; paymentStatus: string; status: string; depositAmount: number; createdAt: number };

// Đơn đang chờ khoản trả trước đầu tiên: còn chờ xác nhận, chưa trả gì, và phương thức đòi trả trước
// (chuyển khoản, VNPay, hoặc COD có cọc đặt trước).
export function awaitsPrepayment(order: Omit<Payable, "createdAt">): boolean {
  return (
    order.status === "pending" &&
    order.paymentStatus === "unpaid" &&
    (order.paymentMethod === "bank" || order.paymentMethod === "vnpay" || order.depositAmount > 0)
  );
}

// Số giờ giữ hàng: VNPay ngắn hơn vì khách trả ngay trên cổng; chuyển khoản và cọc cần thời gian chuyển.
export function holdHours(paymentMethod: string): number {
  return paymentMethod === "vnpay" ? site.payment.onlineHoldHours : site.payment.transferHoldHours;
}

export function prepaymentDeadline(order: Pick<Payable, "paymentMethod" | "createdAt">): number {
  return order.createdAt + holdHours(order.paymentMethod) * HOUR;
}

export function reminderAt(order: Pick<Payable, "createdAt">): number {
  return order.createdAt + site.payment.transferRemindHours * HOUR;
}

export const TRANSFER_NOTE_MAX = 300;
