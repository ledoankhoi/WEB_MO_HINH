import { site } from "@/config/site";

// Phí vận chuyển: miễn phí từ ngưỡng `freeFrom`, còn lại tính phí cố định.
export function shippingFee(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= site.shipping.freeFrom ? 0 : site.shipping.flatFee;
}

export function orderTotals(lines: readonly { price: number; quantity: number }[]) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const shipping = shippingFee(subtotal);
  return { subtotal, shipping, total: subtotal + shipping };
}

// Giới hạn số lượng theo tồn kho và mức tối đa mỗi đơn.
export function clampQuantity(quantity: number, stock: number): number {
  const max = Math.min(site.maxQtyPerItem, Math.max(0, Math.floor(stock)));
  if (!Number.isFinite(quantity)) return Math.min(1, max);
  return Math.max(Math.min(1, max), Math.min(Math.floor(quantity), max));
}
