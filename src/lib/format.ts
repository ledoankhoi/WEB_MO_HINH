const NBSP = " ";
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-${digits}` : digits;
}

// Định dạng thủ công (không dùng Intl) để chuỗi giống hệt nhau trên máy chủ và trình duyệt,
// tránh lệch hydration khi hai bên dùng bản ICU khác nhau.
export function formatVnd(amount: number): string {
  return `${formatNumber(amount)}${NBSP}₫`;
}

// Việt Nam không dùng giờ mùa hè nên cộng cố định +7 giờ.
export function formatDate(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} ${formatDate(ms)}`;
}

// Bỏ dấu tiếng Việt, đưa về chữ thường. Dùng cho tìm kiếm không phân biệt dấu.
export function foldText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(input: string): string {
  return foldText(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Phần trăm giảm giá (làm tròn), hoặc null nếu không có giá gốc hợp lệ.
export function discountPercent(price: number, compareAtPrice: number | null): number | null {
  if (!compareAtPrice || compareAtPrice <= price) return null;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

// Ngày "YYYY-MM-DD" (ô nhập kiểu date) thành mốc 00:00 giờ Việt Nam, tính bằng mili giây UTC.
export function parseVnDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const ms = Date.UTC(year, month - 1, day);
  // Date.UTC tự cộng dồn ngày sai (31/02 thành 03/03); so lại để từ chối.
  const date = new Date(ms);
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 ? ms - VN_OFFSET_MS : null;
}

// Ô <input type="datetime-local"> theo giờ Việt Nam: "YYYY-MM-DDTHH:mm" ⇄ mili giây UTC.
export function parseVnDateTime(value: string): number | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const day = parseVnDate(match[1]);
  const [hours, minutes] = [Number(match[2]), Number(match[3])];
  return day === null || hours > 23 || minutes > 59 ? null : day + (hours * 60 + minutes) * 60_000;
}

export function toVnDateTimeInput(ms: number): string {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 16);
}

// SEC-02: che thông tin cá nhân cho vai trò chỉ xem, làm ở máy chủ trước khi gửi xuống trình duyệt.
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return domain ? `${name.slice(0, 1)}***@${domain}` : "***";
}
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length < 4 ? "***" : `${digits.slice(0, 2)}${"*".repeat(Math.max(digits.length - 4, 3))}${digits.slice(-2)}`;
}
export const maskText = (text: string) => (text ? "***" : "");
