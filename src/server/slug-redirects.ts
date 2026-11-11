import "server-only";
import { getDb } from "./db";

// Bảng slug cũ → slug hiện tại của sản phẩm đang bán, giữ trong bộ nhớ tối đa một phút để proxy không
// truy vấn CSDL ở mỗi lượt xem sản phẩm. Đổi slug xong, slug cũ chuyển hướng sau tối đa một phút.
const TTL = 60_000;
let cache: { at: number; map: Map<string, string> } | null = null;

export async function loadSlugRedirects(): Promise<Map<string, string>> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT r.old_slug, p.slug FROM slug_redirects r JOIN products p ON p.id = r.product_id WHERE p.status = 'published' AND p.slug <> r.old_slug",
  );
  return new Map(result.rows.map((row) => [String(row.old_slug), String(row.slug)]));
}

// Lần tải đang chạy: nhiều yêu cầu tới cùng lúc khi bộ nhớ trống (ví dụ trình duyệt tải trước mọi thẻ sản phẩm trên
// trang chủ) dùng chung một truy vấn thay vì mỗi yêu cầu một truy vấn.
let loading: Promise<Map<string, string>> | null = null;

export async function findSlugRedirect(slug: string, now = Date.now()): Promise<string | null> {
  if (!cache || now - cache.at > TTL) {
    try {
      loading ??= loadSlugRedirects().finally(() => {
        loading = null;
      });
      cache = { at: now, map: await loading };
    } catch {
      // CSDL lỗi thì bỏ qua chuyển hướng, trang sản phẩm tự báo không tìm thấy.
      return cache?.map.get(slug) ?? null;
    }
  }
  return cache.map.get(slug) ?? null;
}
