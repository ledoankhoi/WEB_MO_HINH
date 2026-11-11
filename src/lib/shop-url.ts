// Đường dẫn lọc của trang cửa hàng /san-pham. Mọi tuỳ chọn nằm trên URL (chia sẻ, quay lại được); đổi một tuỳ chọn
// thì giữ các tuỳ chọn khác và quay về trang 1. Dùng chung cho trang (máy chủ) và khối "Tùy chọn sản phẩm" (trình duyệt).

// Tên tham số trên URL -> giá trị hiện tại; giá trị rỗng nghĩa là không lọc.
export type ShopQuery = Record<string, string>;

export function shopHref(current: ShopQuery, changes: ShopQuery = {}): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, trang: "", ...changes })) if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/san-pham?${query}` : "/san-pham";
}

// Bấm một lựa chọn đang bật thì tắt nó (về tất cả), bấm lựa chọn khác thì chuyển sang lựa chọn đó.
export function toggleHref(current: ShopQuery, key: string, value: string): string {
  return shopHref(current, { [key]: current[key] === value ? "" : value });
}

// Khoảng giá có sẵn trong bảng "Giá". `min`, `max` rỗng nghĩa là không giới hạn phía đó.
export const PRICE_RANGES = [
  { label: "Dưới 1 triệu ₫", min: "", max: "999999" },
  { label: "1 – 2 triệu ₫", min: "1000000", max: "2000000" },
  { label: "2 – 3 triệu ₫", min: "2000000", max: "3000000" },
  { label: "Trên 3 triệu ₫", min: "3000000", max: "" },
] as const;

// Khoảng giá đang lọc có trùng một khoảng có sẵn không; bấm lại khoảng đang bật thì bỏ lọc giá.
export function priceRangeHref(current: ShopQuery, range: { min: string; max: string }): { href: string; active: boolean } {
  const active = (current["gia-tu"] ?? "") === range.min && (current["gia-den"] ?? "") === range.max;
  return { active, href: shopHref(current, active ? { "gia-tu": "", "gia-den": "" } : { "gia-tu": range.min, "gia-den": range.max }) };
}
