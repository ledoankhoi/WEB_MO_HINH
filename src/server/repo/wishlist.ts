import "server-only";
import type { ProductSummary } from "@/lib/types";
import { getDb } from "../db";
import { SUMMARY_COLUMNS, toSummary } from "./products";

// Yêu thích (YC-DG-03). Chỉ sản phẩm đang bán mới thêm được; thêm lặp không tạo dòng trùng.
export async function addToWishlist(userId: string, productId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: `INSERT INTO wishlist_items (user_id, product_id, created_at)
          SELECT ?, id, ? FROM products WHERE id = ? AND status = 'published'
          ON CONFLICT DO NOTHING`,
    args: [userId, Date.now(), productId],
  });
  return result.rowsAffected > 0;
}

export async function removeFromWishlist(userId: string, productId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({ sql: "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?", args: [userId, productId] });
  return result.rowsAffected > 0;
}

export async function listWishlistIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT product_id FROM wishlist_items WHERE user_id = ? LIMIT 500", args: [userId] });
  return result.rows.map((row) => String(row.product_id));
}

// Danh sách trong trang tài khoản: sản phẩm còn hiện cho khách, mới thêm trước.
export async function listWishlistProducts(userId: string): Promise<ProductSummary[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS.split(", ").map((c) => `p.${c}`).join(", ")} FROM wishlist_items w JOIN product_list p ON p.id = w.product_id
          WHERE w.user_id = ? AND p.is_active ORDER BY w.created_at DESC LIMIT 100`,
    args: [userId],
  });
  return result.rows.map(toSummary);
}

// YC-KH-06: sản phẩm được yêu thích nhiều nhất (quản trị).
export async function topWishlisted(limit = 10): Promise<{ id: string; name: string; count: number }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT p.id, p.name, COUNT(*) AS n FROM wishlist_items w JOIN products p ON p.id = w.product_id
          GROUP BY p.id, p.name ORDER BY n DESC, p.name LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), count: Number(row.n) }));
}
