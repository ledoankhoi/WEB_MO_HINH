import "server-only";
import { getDb, isConstraintError, type InValue, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";

// Đánh giá (YC-DG-01, 02; 04 mục 7): pending → approved hoặc hidden; approved ⇄ hidden.
export type ReviewStatus = "pending" | "approved" | "hidden";
export const REVIEW_STATUSES: readonly ReviewStatus[] = ["pending", "approved", "hidden"];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", hidden: "Đã ẩn" };

export type Review = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  createdAt: number;
};

function toReview(row: Row): Review {
  const status = String(row.status);
  return {
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productSlug: String(row.product_slug),
    userId: String(row.user_id),
    userName: String(row.user_name),
    rating: Number(row.rating),
    comment: String(row.comment),
    status: REVIEW_STATUSES.find((s) => s === status) ?? "pending",
    createdAt: Number(row.created_at),
  };
}

const REVIEW_SQL = `SELECT r.*, p.name AS product_name, p.slug AS product_slug, u.name AS user_name
                    FROM reviews r JOIN products p ON p.id = r.product_id JOIN users u ON u.id = r.user_id`;

// Dòng đơn khách được đánh giá: thuộc đơn `completed` của chính khách và chưa có đánh giá.
export async function listReviewableItems(userId: string): Promise<{ orderItemId: number; productName: string; variantName: string; orderCode: string }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT oi.id, oi.product_name, oi.variant_name, o.code FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.user_id = ? AND o.status = 'completed' AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.order_item_id = oi.id)
          ORDER BY o.created_at DESC, oi.id LIMIT 20`,
    args: [userId],
  });
  return result.rows.map((row) => ({ orderItemId: Number(row.id), productName: String(row.product_name), variantName: String(row.variant_name), orderCode: String(row.code) }));
}

// Điều kiện gửi kiểm tra trong chính câu INSERT. Trả về "ok", "duplicate" (dòng này đã đánh giá) hoặc "not_allowed".
export async function submitReview(userId: string, orderItemId: number, rating: number, comment: string): Promise<"ok" | "duplicate" | "not_allowed"> {
  const db = await getDb();
  const now = Date.now();
  try {
    const result = await db.execute({
      sql: `INSERT INTO reviews (id, order_item_id, product_id, user_id, rating, comment, created_at, updated_at)
            SELECT ?, oi.id, oi.product_id, o.user_id, ?, ?, ?, ? FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE oi.id = ? AND o.user_id = ? AND o.status = 'completed'`,
      args: [newId(), rating, comment, now, now, orderItemId, userId],
    });
    return result.rowsAffected > 0 ? "ok" : "not_allowed";
  } catch (error) {
    if (isConstraintError(error)) return "duplicate";
    throw error;
  }
}

// Đánh giá khách thấy ở trang sản phẩm: chỉ `approved`, kèm điểm trung bình và số đánh giá.
export async function listApprovedReviews(productId: string, limit = 20): Promise<{ average: number; count: number; items: Review[] }> {
  const db = await getDb();
  const [stats, rows] = await db.batch([
    { sql: "SELECT COUNT(*) AS n, COALESCE(AVG(rating), 0) AS average FROM reviews WHERE product_id = ? AND status = 'approved'", args: [productId] },
    { sql: `${REVIEW_SQL} WHERE r.product_id = ? AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT ?`, args: [productId, limit] },
  ]);
  return { count: Number(stats.rows[0].n), average: Math.round(Number(stats.rows[0].average) * 10) / 10, items: rows.rows.map(toReview) };
}

export async function listReviews(query: { status?: ReviewStatus; rating?: number; userId?: string; page?: number; pageSize?: number }): Promise<{ items: Review[]; total: number }> {
  const filters: [string, InValue][] = [];
  if (query.status) filters.push(["r.status = ?", query.status]);
  if (query.rating) filters.push(["r.rating = ?", query.rating]);
  if (query.userId) filters.push(["r.user_id = ?", query.userId]);
  const where = filters.length ? `WHERE ${filters.map(([sql]) => sql).join(" AND ")}` : "";
  const args = filters.map(([, value]) => value);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*) AS n FROM reviews r ${where}`, args },
    { sql: `${REVIEW_SQL} ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, (page - 1) * pageSize] },
  ]);
  return { items: rows.rows.map(toReview), total: Number(count.rows[0].n) };
}

// Chuyển trạng thái đúng luật: không quay về `pending`, không đặt lại trạng thái đang có.
export async function setReviewStatus(id: string, status: "approved" | "hidden", entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit({ sql: "UPDATE reviews SET status = ?, updated_at = ? WHERE id = ? AND status <> ?", args: [status, Date.now(), id, status] }, entry),
  );
  return result.rowsAffected > 0;
}
