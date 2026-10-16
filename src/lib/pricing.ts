import { site } from "@/config/site";
import { formatVnd } from "./format";

// Phí vận chuyển: miễn phí từ ngưỡng `freeFrom`, còn lại tính phí cố định.
export function shippingFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= site.shipping.freeFrom ? 0 : site.shipping.flatFee;
}

// Phí vận chuyển tính trên tạm tính trước giảm giá; mã giảm giá không áp cho phí vận chuyển (QT-21).
export function orderTotals(lines: readonly { price: number; quantity: number }[], discount = 0) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const shipping = shippingFee(subtotal);
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}

// Số tiền giảm của một mã trên phần tạm tính hợp lệ (đúng danh mục), làm tròn xuống tới đồng, không vượt phần đó.
export function couponDiscount(coupon: { kind: "fixed" | "percent"; value: number; maxDiscount: number | null }, eligibleSubtotal: number): number {
  const raw = coupon.kind === "percent" ? Math.floor((eligibleSubtotal * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, coupon.maxDiscount ?? raw, eligibleSubtotal));
}

export type CouponRejection = "not_found" | "inactive" | "not_started" | "expired" | "exhausted" | "min_subtotal" | "category";

// Lời báo cho khách; không phân biệt mã không tồn tại với mã đã tắt để khỏi lộ mã nội bộ.
export function couponMessage(reason: CouponRejection, minSubtotal?: number): string {
  if (reason === "not_found" || reason === "inactive") return "Mã giảm giá không hợp lệ.";
  if (reason === "not_started") return "Mã giảm giá chưa tới thời gian áp dụng.";
  if (reason === "expired") return "Mã giảm giá đã hết hạn.";
  if (reason === "exhausted") return "Mã giảm giá đã hết lượt sử dụng.";
  if (reason === "min_subtotal") return `Mã này áp dụng cho đơn từ ${formatVnd(minSubtotal ?? 0)}.`;
  return "Giỏ hàng không có sản phẩm thuộc danh mục được giảm.";
}

// Giới hạn số lượng theo tồn kho và mức tối đa mỗi đơn.
export function clampQuantity(quantity: number, stock: number): number {
  const max = Math.min(site.maxQtyPerItem, Math.max(0, Math.floor(stock)));
  if (!Number.isFinite(quantity)) return Math.min(1, max);
  return Math.max(Math.min(1, max), Math.min(Math.floor(quantity), max));
}
