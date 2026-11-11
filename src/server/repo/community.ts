import "server-only";
import { isCommunityTopic, type CommunityComment, type CommunityPost, type CommunityTopic, type ReportReason } from "@/lib/community";
import { getDb, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";

// Cộng đồng (/cong-dong, migration ext_02). Bài đăng chờ duyệt mới hiện công khai; tác giả thấy bài của mình ở mọi trạng
// thái. Bình luận hiện ngay, nhân viên ẩn được. Mọi thao tác kiểm duyệt ghi nhật ký.

const POST_COLUMNS = `p.id, p.topic, p.body, p.status, p.moderation_note, p.created_at, p.user_id, u.name AS author_name,
  pr.slug AS product_slug, pr.name AS product_name, pr.image AS product_image, pl.price AS product_price,
  (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id)::int AS likes,
  (SELECT COUNT(*) FROM community_comments c WHERE c.post_id = p.id AND c.status = 'visible')::int AS comments,
  EXISTS (SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked,
  COALESCE((SELECT string_agg(i.url, ' ' ORDER BY i.sort_order) FROM community_post_images i WHERE i.post_id = p.id), '') AS images`;
const POST_FROM = `FROM community_posts p JOIN users u ON u.id = p.user_id
  LEFT JOIN products pr ON pr.id = p.product_id LEFT JOIN product_list pl ON pl.id = p.product_id`;

function toPost(row: Row): CommunityPost {
  const topic = String(row.topic);
  const status = String(row.status);
  return {
    id: String(row.id),
    topic: isCommunityTopic(topic) ? topic : "chia-se",
    body: String(row.body),
    status: status === "approved" || status === "hidden" ? status : "pending",
    moderationNote: String(row.moderation_note),
    createdAt: Number(row.created_at),
    author: { id: String(row.user_id), name: String(row.author_name) },
    images: String(row.images).split(" ").filter(Boolean),
    product:
      row.product_slug === null || row.product_slug === undefined
        ? null
        : { slug: String(row.product_slug), name: String(row.product_name), image: row.product_image === null ? null : String(row.product_image), price: Number(row.product_price ?? 0) },
    likes: Number(row.likes),
    comments: Number(row.comments),
    likedByViewer: row.liked === true,
  };
}

// Bài mới ở trạng thái chờ duyệt. `productSlug` không có hoặc ngừng bán thì bỏ qua.
export async function createPost(
  userId: string,
  input: { id: string; topic: CommunityTopic; body: string; productSlug: string | null },
  imageUrls: readonly string[],
): Promise<string> {
  const db = await getDb();
  const now = Date.now();
  await db.batch([
    {
      sql: `INSERT INTO community_posts (id, user_id, topic, body, product_id, status, created_at)
            VALUES (?, ?, ?, ?, (SELECT id FROM products WHERE slug = ? AND status = 'published'), 'pending', ?)`,
      args: [input.id, userId, input.topic, input.body, input.productSlug ?? "", now],
    },
    ...imageUrls.map((url, index) => ({
      sql: "INSERT INTO community_post_images (id, post_id, url, sort_order) VALUES (?, ?, ?, ?)",
      args: [newId(), input.id, url, index],
    })),
  ]);
  return input.id;
}

export async function countRecentPosts(userId: string, sinceMs: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM community_posts WHERE user_id = ? AND created_at > ?", args: [userId, sinceMs] });
  return Number(result.rows[0].n);
}

export type FeedQuery = { topic?: CommunityTopic; sort: "moi" | "noi-bat"; page: number; pageSize: number; viewerId: string | null };

// Bài đã duyệt; "noi-bat" xếp theo lượt thích trong 30 ngày rồi mới nhất.
export async function listFeed(query: FeedQuery): Promise<{ items: CommunityPost[]; total: number }> {
  const db = await getDb();
  const where = ["p.status = 'approved'"];
  const args: string[] = [];
  if (query.topic) {
    where.push("p.topic = ?");
    args.push(query.topic);
  }
  const order =
    query.sort === "noi-bat"
      ? "(SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id AND l.created_at > extract(epoch from now()) * 1000 - 2592000000) DESC, p.created_at DESC, p.id"
      : "p.created_at DESC, p.id";
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*)::int AS n FROM community_posts p WHERE ${where.join(" AND ")}`, args },
    {
      sql: `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`,
      args: [query.viewerId ?? "", ...args, query.pageSize, (Math.max(query.page, 1) - 1) * query.pageSize],
    },
  ]);
  return { items: rows.rows.map(toPost), total: Number(count.rows[0].n) };
}

// Bài của chính khách (mọi trạng thái), để họ thấy bài đang chờ duyệt hoặc bị ẩn.
export async function listOwnPosts(userId: string, limit = 10): Promise<CommunityPost[]> {
  const db = await getDb();
  const result = await db.execute({ sql: `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT ?`, args: [userId, userId, limit] });
  return result.rows.map(toPost);
}

// Một bài: công khai nếu đã duyệt; tác giả xem được bài của mình ở mọi trạng thái.
export async function findPost(id: string, viewerId: string | null): Promise<CommunityPost | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${POST_COLUMNS} ${POST_FROM} WHERE p.id = ? AND (p.status = 'approved' OR p.user_id = ?)`,
    args: [viewerId ?? "", id, viewerId ?? ""],
  });
  return result.rows[0] ? toPost(result.rows[0]) : null;
}

export async function listComments(postId: string, includeHidden = false): Promise<CommunityComment[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT c.id, c.body, c.status, c.created_at, c.user_id, u.name FROM community_comments c JOIN users u ON u.id = c.user_id
          WHERE c.post_id = ? ${includeHidden ? "" : "AND c.status = 'visible'"} ORDER BY c.created_at, c.id`,
    args: [postId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    body: String(row.body),
    createdAt: Number(row.created_at),
    author: { id: String(row.user_id), name: String(row.name) },
    status: row.status === "hidden" ? "hidden" : "visible",
  }));
}

// Bình luận chỉ vào bài đã duyệt. Trả về id, null nếu bài không có hoặc chưa duyệt.
export async function addComment(userId: string, postId: string, body: string): Promise<string | null> {
  const db = await getDb();
  const id = newId();
  const result = await db.execute({
    sql: `INSERT INTO community_comments (id, post_id, user_id, body, created_at)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM community_posts WHERE id = ? AND status = 'approved')`,
    args: [id, postId, userId, body, Date.now(), postId],
  });
  return result.rowsAffected > 0 ? id : null;
}

// Thả hoặc bỏ tim một bài đã duyệt. Trả về trạng thái mới và tổng số tim; null nếu bài không có.
export async function toggleLike(userId: string, postId: string): Promise<{ liked: boolean; likes: number } | null> {
  const db = await getDb();
  const removed = await db.execute({ sql: "DELETE FROM community_likes WHERE post_id = ? AND user_id = ?", args: [postId, userId] });
  if (removed.rowsAffected === 0) {
    const added = await db.execute({
      sql: `INSERT INTO community_likes (post_id, user_id, created_at)
            SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM community_posts WHERE id = ? AND status = 'approved') ON CONFLICT DO NOTHING`,
      args: [postId, userId, Date.now(), postId],
    });
    if (added.rowsAffected === 0) return null;
  }
  const count = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM community_likes WHERE post_id = ?", args: [postId] });
  return { liked: removed.rowsAffected === 0, likes: Number(count.rows[0].n) };
}

// Báo cáo bài hoặc bình luận; mỗi người một báo cáo đang mở cho mỗi nội dung.
export async function reportContent(userId: string, target: { postId: string } | { commentId: string }, reason: ReportReason): Promise<"ok" | "duplicate" | "not_found"> {
  const db = await getDb();
  const [column, id] = "postId" in target ? ["post_id", target.postId] : ["comment_id", target.commentId];
  const table = column === "post_id" ? "community_posts" : "community_comments";
  const exists = await db.execute({ sql: `SELECT 1 FROM ${table} WHERE id = ?`, args: [id] });
  if (exists.rows.length === 0) return "not_found";
  const result = await db.execute({
    sql: `INSERT INTO community_reports (id, ${column}, user_id, reason, created_at)
          SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM community_reports WHERE ${column} = ? AND user_id = ? AND resolved_at IS NULL)`,
    args: [newId(), id, userId, reason, Date.now(), id, userId],
  });
  return result.rowsAffected > 0 ? "ok" : "duplicate";
}

// Thành viên nổi bật: tổng tim nhận được ở các bài đã duyệt trong 7 ngày.
export async function listTopMembers(limit = 5): Promise<{ id: string; name: string; likes: number; posts: number }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT u.id, u.name, COUNT(l.user_id)::int AS likes, COUNT(DISTINCT p.id)::int AS posts
          FROM community_posts p JOIN users u ON u.id = p.user_id
          LEFT JOIN community_likes l ON l.post_id = p.id AND l.created_at > extract(epoch from now()) * 1000 - 604800000
          WHERE p.status = 'approved' AND u.is_active
          GROUP BY u.id, u.name HAVING COUNT(DISTINCT p.id) > 0 ORDER BY likes DESC, posts DESC, u.name LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), likes: Number(row.likes), posts: Number(row.posts) }));
}

// Đánh giá sản phẩm đã duyệt mới nhất (tab "Đánh giá sản phẩm" của Cộng đồng).
export async function listRecentReviews(limit = 12) {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT r.id, r.rating, r.comment, r.created_at, u.name AS user_name, p.slug, p.name AS product_name, p.image
          FROM reviews r JOIN users u ON u.id = r.user_id JOIN products p ON p.id = r.product_id
          WHERE r.status = 'approved' AND p.status = 'published' ORDER BY r.created_at DESC LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    rating: Number(row.rating),
    comment: String(row.comment),
    createdAt: Number(row.created_at),
    userName: String(row.user_name),
    product: { slug: String(row.slug), name: String(row.product_name), image: row.image === null ? null : String(row.image) },
  }));
}

// ----- Kiểm duyệt (quản trị, quyền community.moderate) -----

export type ModerationItem = CommunityPost & { openReports: number };

export async function listForModeration(status: "pending" | "approved" | "hidden" | "reported", page: number, pageSize: number): Promise<{ items: ModerationItem[]; total: number }> {
  const db = await getDb();
  const where =
    status === "reported"
      ? "EXISTS (SELECT 1 FROM community_reports r WHERE r.resolved_at IS NULL AND (r.post_id = p.id OR r.comment_id IN (SELECT id FROM community_comments WHERE post_id = p.id)))"
      : "p.status = ?";
  const args = status === "reported" ? [] : [status];
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*)::int AS n FROM community_posts p WHERE ${where}`, args },
    {
      sql: `SELECT ${POST_COLUMNS},
              (SELECT COUNT(*) FROM community_reports r WHERE r.resolved_at IS NULL
                AND (r.post_id = p.id OR r.comment_id IN (SELECT id FROM community_comments WHERE post_id = p.id)))::int AS open_reports
            ${POST_FROM} WHERE ${where} ORDER BY p.created_at ${status === "pending" ? "ASC" : "DESC"}, p.id LIMIT ? OFFSET ?`,
      args: ["", ...args, pageSize, (Math.max(page, 1) - 1) * pageSize],
    },
  ]);
  return { items: rows.rows.map((row) => ({ ...toPost(row), openReports: Number(row.open_reports) })), total: Number(count.rows[0].n) };
}

export async function listOpenReports(postId: string) {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT r.id, r.reason, r.created_at, r.comment_id, c.body AS comment_body, u.name AS reporter
          FROM community_reports r JOIN users u ON u.id = r.user_id LEFT JOIN community_comments c ON c.id = r.comment_id
          WHERE r.resolved_at IS NULL AND (r.post_id = ? OR c.post_id = ?) ORDER BY r.created_at`,
    args: [postId, postId],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    reason: String(row.reason),
    createdAt: Number(row.created_at),
    commentId: row.comment_id === null ? null : String(row.comment_id),
    commentBody: row.comment_body === null ? null : String(row.comment_body),
    reporter: String(row.reporter),
  }));
}

// Duyệt hoặc ẩn bài (kèm ghi chú cho tác giả khi ẩn). Ẩn bài thì các báo cáo của bài được đánh dấu đã xử lý.
export async function moderatePost(id: string, status: "approved" | "hidden", note: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const [changed] = await db.batch([
    withAudit(
      {
        sql: "UPDATE community_posts SET status = ?, moderation_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status <> ?",
        args: [status, note, entry.actor.id, now, id, status],
      },
      entry,
    ),
    {
      sql: "UPDATE community_reports SET resolved_at = ?, resolved_by = ? WHERE post_id = ? AND resolved_at IS NULL AND ? = 'hidden'",
      args: [now, entry.actor.id, id, status],
    },
  ]);
  return changed.rowsAffected > 0;
}

export async function setCommentStatus(id: string, status: "visible" | "hidden", entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const [changed] = await db.batch([
    withAudit({ sql: "UPDATE community_comments SET status = ? WHERE id = ? AND status <> ?", args: [status, id, status] }, entry),
    { sql: "UPDATE community_reports SET resolved_at = ?, resolved_by = ? WHERE comment_id = ? AND resolved_at IS NULL", args: [now, entry.actor.id, id] },
  ]);
  return changed.rowsAffected > 0;
}

// Bỏ qua báo cáo (nội dung không vi phạm).
export async function dismissReport(id: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit({ sql: "UPDATE community_reports SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL", args: [Date.now(), entry.actor.id, id] }, entry),
  );
  return result.rowsAffected > 0;
}
