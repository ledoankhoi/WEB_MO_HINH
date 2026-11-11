import "server-only";
import { getDb, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";

// Tin tức (/tin-tuc). Nội dung là văn bản thuần như trang thông tin (Q19): không lưu, không hiện HTML.

export type NewsPost = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  coverImage: string | null;
  status: "draft" | "published";
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type NewsInput = Pick<NewsPost, "slug" | "title" | "summary" | "body" | "coverImage">;
// Danh sách ở cửa hàng không cần nội dung bài.
export type NewsSummary = Omit<NewsPost, "body">;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toNews(row: Row): NewsPost {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary),
    body: String(row.body ?? ""),
    coverImage: row.cover_image === null ? null : String(row.cover_image),
    status: row.status === "published" ? "published" : "draft",
    publishedAt: num(row.published_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

// Quản trị: mọi bài, mới sửa lên trước.
export async function listNews(): Promise<NewsPost[]> {
  const db = await getDb();
  return (await db.execute("SELECT * FROM news_posts ORDER BY updated_at DESC")).rows.map(toNews);
}

export async function findNews(id: string): Promise<NewsPost | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT * FROM news_posts WHERE id = ?", args: [id] })).rows[0];
  return row ? toNews(row) : null;
}

const SUMMARY_COLUMNS = "id, slug, title, summary, cover_image, status, published_at, created_at, updated_at";

// Cửa hàng: bài đã xuất bản, mới đăng lên trước.
export async function listPublishedNews(limit = 60): Promise<NewsSummary[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM news_posts WHERE status = 'published' ORDER BY published_at DESC, id LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row): NewsSummary => {
    const post: Partial<NewsPost> = toNews(row);
    delete post.body;
    return post as NewsSummary;
  });
}

export async function findPublishedNews(slug: string): Promise<NewsPost | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT * FROM news_posts WHERE slug = ? AND status = 'published'", args: [slug] })).rows[0];
  return row ? toNews(row) : null;
}

// Ném lỗi ràng buộc khi trùng slug. Trả về null khi bài cần sửa không còn.
export async function saveNews(id: string | null, input: NewsInput, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  const now = Date.now();
  const args = [input.slug, input.title, input.summary, input.body, input.coverImage];
  if (id) {
    const result = await db.execute(
      withAudit({ sql: "UPDATE news_posts SET slug = ?, title = ?, summary = ?, body = ?, cover_image = ?, updated_at = ? WHERE id = ?", args: [...args, now, id] }, entry),
    );
    return result.rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    {
      sql: "INSERT INTO news_posts (slug, title, summary, body, cover_image, id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [...args, newIdValue, entry.actor.id, now, now],
    },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

// Xuất bản lần đầu thì ghi ngày đăng; gỡ xuống rồi xuất bản lại vẫn giữ ngày đăng cũ.
export async function setNewsStatus(id: string, status: "draft" | "published", entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.execute(
    withAudit(
      {
        sql: `UPDATE news_posts SET status = ?, published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?::bigint) ELSE published_at END,
                updated_at = ? WHERE id = ? AND status <> ?`,
        args: [status, status, now, now, id, status],
      },
      entry,
    ),
  );
  return result.rowsAffected > 0;
}

export async function deleteNews(id: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  return (await db.execute(withAudit({ sql: "DELETE FROM news_posts WHERE id = ?", args: [id] }, entry))).rowsAffected > 0;
}
