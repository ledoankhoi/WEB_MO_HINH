// "Đã xem gần đây" ở trình duyệt (nghiep-vu-ban-hang mục 8): danh sách slug, mới nhất trước. Khách đã đăng nhập thì máy chủ
// gộp danh sách này vào tài khoản (POST /api/da-xem). localStorage có thể bị chặn: khi đó coi như danh sách rỗng.

const STORAGE_KEY = "robostore:viewed:v1";
export const MAX_VIEWED = 20;
export const SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export function readViewed(): string[] {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter((slug): slug is string => typeof slug === "string" && SLUG_PATTERN.test(slug)).slice(0, MAX_VIEWED) : [];
  } catch {
    return [];
  }
}

// Đưa một sản phẩm lên đầu danh sách; trả về danh sách mới.
export function pushViewed(slug: string): string[] {
  const next = [slug, ...readViewed().filter((item) => item !== slug)].slice(0, MAX_VIEWED);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Bỏ qua: xem ghi chú đầu file.
  }
  return next;
}

export function clearViewed(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Bỏ qua.
  }
}
