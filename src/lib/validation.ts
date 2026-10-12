// Các hàm kiểm tra dữ liệu form, dùng chung cho Server Action và giao diện.

export function readText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

// Chuẩn hoá số điện thoại Việt Nam về dạng 0xxxxxxxxx. Trả về null nếu không hợp lệ.
// Chấp nhận di động (03, 05, 07, 08, 09 + 8 số) và cố định (02 + 9 số), có hoặc không có mã +84.
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (/^84\d{9,10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0(?:[35789]\d{8}|2\d{9})$/.test(digits) ? digits : null;
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

// Chỉ cho phép chuyển hướng nội bộ sau khi đăng nhập, chặn dạng //evil.example hay /\evil.example.
export function safeRedirectPath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

// Đọc số nguyên không âm từ ô nhập, bỏ qua dấu chấm và khoảng trắng phân cách (ví dụ "2.490.000").
export function parseMoney(value: string): number | null {
  const cleaned = value.replace(/[.\s,₫đ]/gi, "");
  if (!/^\d{1,12}$/.test(cleaned)) return null;
  return Number(cleaned);
}
