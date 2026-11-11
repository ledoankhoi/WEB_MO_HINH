// Trả hàng / hoàn tiền sau khi nhận (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 4). Dùng chung cho máy chủ và trình duyệt.
//
// Luồng: khách gửi yêu cầu (requested) trong RETURN_DAYS ngày kể từ lúc giao thành công → nhân viên duyệt (approved,
// chốt số tiền hoàn) hoặc từ chối (rejected) → khách gửi hàng về, kho lập phiếu hàng trả gắn đơn và ghi sổ (hàng vào khu
// cách ly) → kế toán ghi nhận đã hoàn tiền (refunded). Khách huỷ được khi còn chờ duyệt (cancelled).
// Mỗi đơn có tối đa một yêu cầu đang mở hoặc đã hoàn tiền (bảng payments chỉ có một dòng hoàn tiền mỗi đơn).

import { site } from "@/config/site";

export const RETURN_DAYS = site.policy.returnDays;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const RETURN_STATUSES = ["requested", "approved", "rejected", "refunded", "cancelled"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Chờ duyệt",
  approved: "Đã duyệt, chờ nhận hàng",
  rejected: "Bị từ chối",
  refunded: "Đã hoàn tiền",
  cancelled: "Khách đã huỷ",
};

export const isReturnStatus = (value: unknown): value is ReturnStatus => typeof value === "string" && (RETURN_STATUSES as readonly string[]).includes(value);

// Lý do trả. `photo`: bắt buộc kèm ảnh làm bằng chứng.
export const RETURN_REASONS = {
  defective: { label: "Hàng lỗi, gãy, hỏng", photo: true },
  missing_parts: { label: "Thiếu chi tiết, phụ kiện", photo: true },
  wrong_item: { label: "Giao sai mẫu, sai phiên bản", photo: true },
  not_as_described: { label: "Không giống mô tả", photo: true },
  changed_mind: { label: "Đổi ý (hàng còn nguyên hộp, chưa bóc)", photo: false },
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;
export const isReturnReason = (value: unknown): value is ReturnReason => typeof value === "string" && Object.hasOwn(RETURN_REASONS, value);

export const MAX_RETURN_IMAGES = 4;
export const MAX_RETURN_IMAGE_BYTES = 3 * 1024 * 1024;
export const RETURN_NOTE_MAX = 1000;
export const REFUND_ACCOUNT_MIN = 8;
export const REFUND_ACCOUNT_MAX = 200;

// Hạn gửi yêu cầu: RETURN_DAYS ngày tính từ lúc giao thành công.
export function returnDeadline(deliveredAt: number): number {
  return deliveredAt + RETURN_DAYS * DAY_MS;
}

type Line = { lineId: number; unitPrice: number; quantity: number };
type OrderMoney = { subtotal: number; discount: number; total: number; items: Line[] };

// Số tiền hoàn đề xuất cho các dòng khách chọn: giá trị hàng trả trừ phần giảm giá chia theo tỉ lệ giá trị
// (khách không được hưởng giảm giá trên phần hàng đã trả). Phí giao hàng không hoàn; nhân viên sửa được khi duyệt
// (ví dụ lỗi do cửa hàng thì hoàn cả phí). Không vượt tổng tiền đơn.
export function suggestedRefund(order: OrderMoney, picks: Map<number, number>): number {
  let value = 0;
  for (const item of order.items) value += item.unitPrice * Math.min(picks.get(item.lineId) ?? 0, item.quantity);
  if (value <= 0) return 0;
  const discountShare = order.subtotal > 0 ? Math.round((order.discount * value) / order.subtotal) : 0;
  return Math.max(0, Math.min(order.total, value - discountShare));
}

// Kiểm tra lựa chọn của khách: dòng phải thuộc đơn, số lượng nguyên dương không vượt số đã mua, chọn ít nhất một.
export function validatePicks(items: Line[], picks: Map<number, number>): string | null {
  if (picks.size === 0) return "Chọn ít nhất một sản phẩm muốn trả.";
  const byId = new Map(items.map((item) => [item.lineId, item]));
  for (const [lineId, qty] of picks) {
    const item = byId.get(lineId);
    if (!item) return "Có sản phẩm không thuộc đơn hàng.";
    if (!Number.isInteger(qty) || qty < 1 || qty > item.quantity) return "Số lượng trả không hợp lệ.";
  }
  return null;
}
