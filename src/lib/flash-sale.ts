// Flash sale (docs/ke-hoach/nghiep-vu-ban-hang.md mục 9). Dùng chung cho máy chủ và trình duyệt.
//
// Một chương trình (flash_sales) có khung giờ [startsAt, endsAt); mỗi phiên bản trong chương trình (flash_sale_items) có giá
// sale, tổng số suất và số tối đa mỗi đơn. Trang cửa hàng được cache nhiều giờ nên dữ liệu cache mang thông tin chương trình
// (đang chạy hoặc sắp chạy); trình duyệt tự so với đồng hồ để hiện giá sale và đếm ngược. Máy chủ luôn tính lại giá theo thời
// điểm đặt hàng (findCartProducts, createOrder), không tin giá trình duyệt thấy.

export type FlashOffer = {
  saleId: string;
  title: string;
  // Giá sale của phiên bản (không gồm tuỳ chọn Xưởng).
  price: number;
  startsAt: number;
  endsAt: number;
  // Suất còn lại (tổng suất − đã bán ở đơn chưa huỷ) và số tối đa mỗi đơn (null: không giới hạn riêng).
  left: number;
  maxPerOrder: number | null;
};

export type FlashState = "upcoming" | "live" | "sold_out" | "ended";

// Đọc cột JSON `flash` do máy chủ dựng (flashJson trong src/server/repo/products.ts).
export function parseFlash(value: unknown): FlashOffer | null {
  if (value === null || value === undefined || value === "") return null;
  let data: unknown = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw?.saleId !== "string") return null;
  const qtyLimit = Number(raw.qtyLimit);
  return {
    saleId: raw.saleId,
    title: typeof raw.title === "string" ? raw.title : "Flash sale",
    price: Number(raw.price),
    startsAt: Number(raw.startsAt),
    endsAt: Number(raw.endsAt),
    left: Math.max(0, qtyLimit - Number(raw.sold ?? 0)),
    maxPerOrder: raw.maxPerOrder === null || raw.maxPerOrder === undefined ? null : Number(raw.maxPerOrder),
  };
}

export function flashState(flash: FlashOffer | null, now: number): FlashState | null {
  if (!flash) return null;
  if (now >= flash.endsAt) return "ended";
  if (now < flash.startsAt) return "upcoming";
  return flash.left > 0 ? "live" : "sold_out";
}

// Giá bán lúc `now`: giá sale khi chương trình đang chạy và còn suất, không thì giá thường.
export function effectivePrice(basePrice: number, flash: FlashOffer | null, now: number): number {
  return flashState(flash, now) === "live" ? flash!.price : basePrice;
}

// Số tối đa đặt được với giá sale trong một đơn (khi đang chạy).
export function flashLimit(flash: FlashOffer): number {
  return Math.min(flash.left, flash.maxPerOrder ?? flash.left);
}

// Thời gian còn lại dạng "2 ngày 03:04:05" hoặc "03:04:05".
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days} ngày ${clock}` : clock;
}

// Giới hạn khi nhân viên lập chương trình.
export const FLASH_MAX_DAYS = 30;
