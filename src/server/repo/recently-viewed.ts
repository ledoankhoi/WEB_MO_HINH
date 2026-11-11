import "server-only";
import type { ProductSummary } from "@/lib/types";
import { getDb, type InStatement } from "../db";
import { summaryColumns, toSummary } from "./products";

// "Đã xem gần đây" (nghiep-vu-ban-hang mục 8). Khách đã đăng nhập: bảng recently_viewed, theo tài khoản trên mọi thiết bị.
// Khách vãng lai: danh sách slug trong trình duyệt (src/lib/recently-viewed.ts), máy chủ chỉ tra thông tin sản phẩm.

export const KEEP_PER_USER = 30;

// Ghi các sản phẩm khách vừa xem, `slugs` mới nhất trước (trình duyệt gửi cả danh sách của nó để gộp khi mới đăng nhập).
// Sản phẩm đã có thì chỉ cập nhật thời điểm nếu mới hơn. Giữ KEEP_PER_USER dòng gần nhất.
export async function recordViews(userId: string, slugs: readonly string[], now: number): Promise<void> {
  if (slugs.length === 0) return;
  const db = await getDb();
  const statements: InStatement[] = slugs.map((slug, index) => ({
    // Thứ tự trong danh sách thành thời điểm cách nhau 1 ms để giữ đúng thứ tự gần nhất.
    sql: `INSERT INTO recently_viewed (user_id, product_id, viewed_at)
          SELECT ?, id, ? FROM products WHERE slug = ? AND status = 'published'
          ON CONFLICT (user_id, product_id) DO UPDATE SET viewed_at = GREATEST(recently_viewed.viewed_at, EXCLUDED.viewed_at)`,
    args: [userId, now - index, slug],
  }));
  statements.push({
    sql: `DELETE FROM recently_viewed WHERE user_id = ? AND product_id NOT IN (
            SELECT product_id FROM recently_viewed WHERE user_id = ? ORDER BY viewed_at DESC LIMIT ?)`,
    args: [userId, userId, KEEP_PER_USER],
  });
  await db.batch(statements);
}

// Danh sách của tài khoản, mới nhất trước, chỉ sản phẩm còn bán.
export async function listRecentlyViewed(userId: string, limit: number): Promise<ProductSummary[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${summaryColumns("p")} FROM recently_viewed r JOIN product_list p ON p.id = r.product_id
          WHERE r.user_id = ? AND p.is_active ORDER BY r.viewed_at DESC LIMIT ?`,
    args: [userId, limit],
  });
  return result.rows.map(toSummary);
}

export async function clearRecentlyViewed(userId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM recently_viewed WHERE user_id = ?", args: [userId] });
}
