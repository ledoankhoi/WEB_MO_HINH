import "server-only";
import { getDb, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";

// Hỏi đáp trên trang sản phẩm (nghiep-vu-ban-hang mục 11). Khách đặt câu hỏi, chờ duyệt; nhân viên trả lời (hiện ngay, câu
// hỏi được duyệt luôn) hoặc khách đã mua trả lời (chờ duyệt). Khách chỉ thấy câu hỏi, câu trả lời đã duyệt.

export type QaStatus = "pending" | "approved" | "hidden";
export const QA_STATUSES: readonly QaStatus[] = ["pending", "approved", "hidden"];
export const QA_STATUS_LABELS: Record<QaStatus, string> = { pending: "Chờ duyệt", approved: "Đang hiện", hidden: "Đã ẩn" };
const asStatus = (value: unknown): QaStatus => QA_STATUSES.find((s) => s === value) ?? "pending";

export const BODY_MIN = 5;
export const BODY_MAX = 1000;
// Số câu hỏi đang chờ duyệt tối đa của một khách, chặn gửi hàng loạt.
export const MAX_PENDING_QUESTIONS = 5;

export type Answer = { id: string; userName: string; body: string; isStaff: boolean; isBuyer: boolean; status: QaStatus; createdAt: number };
export type Question = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  userId: string;
  userName: string;
  body: string;
  status: QaStatus;
  createdAt: number;
  answers: Answer[];
};

function toAnswer(row: Row): Answer {
  return {
    id: String(row.id),
    userName: String(row.user_name),
    body: String(row.body),
    isStaff: Boolean(row.is_staff),
    isBuyer: Boolean(row.is_buyer),
    status: asStatus(row.status),
    createdAt: Number(row.created_at),
  };
}

const QUESTION_SQL = `SELECT q.*, p.name AS product_name, p.slug AS product_slug, u.name AS user_name
                      FROM product_questions q JOIN products p ON p.id = q.product_id JOIN users u ON u.id = q.user_id`;
const ANSWER_SQL = "SELECT a.*, u.name AS user_name FROM product_answers a JOIN users u ON u.id = a.user_id";

async function attachAnswers(rows: Row[], onlyApproved: boolean): Promise<Question[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((row) => String(row.id));
  const answers = await db.execute({
    sql: `${ANSWER_SQL} WHERE a.question_id IN (${ids.map(() => "?").join(", ")})${onlyApproved ? " AND a.status = 'approved'" : ""}
          ORDER BY a.is_staff DESC, a.created_at`,
    args: ids,
  });
  return rows.map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    productName: String(row.product_name),
    productSlug: String(row.product_slug),
    userId: String(row.user_id),
    userName: String(row.user_name),
    body: String(row.body),
    status: asStatus(row.status),
    createdAt: Number(row.created_at),
    answers: answers.rows.filter((answer) => answer.question_id === row.id).map(toAnswer),
  }));
}

// Câu hỏi đã duyệt của một sản phẩm, mới nhất trước, kèm câu trả lời đã duyệt (nhân viên trước).
export async function listPublicQuestions(productId: string, limit = 30): Promise<{ count: number; items: Question[] }> {
  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: "SELECT COUNT(*)::int AS n FROM product_questions WHERE product_id = ? AND status = 'approved'", args: [productId] },
    { sql: `${QUESTION_SQL} WHERE q.product_id = ? AND q.status = 'approved' ORDER BY q.created_at DESC LIMIT ?`, args: [productId, limit] },
  ]);
  return { count: Number(count.rows[0].n), items: await attachAnswers(rows.rows, true) };
}

export type AskResult = "ok" | "not_found" | "limit";

export async function askQuestion(userId: string, productId: string, body: string): Promise<AskResult> {
  const db = await getDb();
  const pending = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM product_questions WHERE user_id = ? AND status = 'pending'", args: [userId] });
  if (Number(pending.rows[0].n) >= MAX_PENDING_QUESTIONS) return "limit";
  const now = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO product_questions (id, product_id, user_id, body, created_at, updated_at)
          SELECT ?, id, ?, ?, ?, ? FROM products WHERE id = ? AND status = 'published'`,
    args: [newId(), userId, body, now, now, productId],
  });
  return result.rowsAffected > 0 ? "ok" : "not_found";
}

// Khách đã mua sản phẩm (có đơn hoàn tất chứa sản phẩm) trả lời một câu hỏi đang hiện. Chờ duyệt.
export async function answerAsBuyer(userId: string, questionId: string, body: string): Promise<"ok" | "not_buyer" | "not_found"> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO product_answers (id, question_id, user_id, body, is_buyer, created_at, updated_at)
          SELECT ?, q.id, ?, ?, true, ?, ? FROM product_questions q
          WHERE q.id = ? AND q.status = 'approved'
            AND EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                        WHERE oi.product_id = q.product_id AND o.user_id = ? AND o.status = 'completed')`,
    args: [newId(), userId, body, now, now, questionId, userId],
  });
  if (result.rowsAffected > 0) return "ok";
  const question = await db.execute({ sql: "SELECT 1 FROM product_questions WHERE id = ? AND status = 'approved'", args: [questionId] });
  return question.rows.length > 0 ? "not_buyer" : "not_found";
}

// Nhân viên trả lời: câu trả lời hiện ngay, câu hỏi đang chờ được duyệt luôn. Trả về người hỏi để báo qua email.
export async function answerAsStaff(questionId: string, body: string, audit: AuditEntry): Promise<{ askerId: string; productSlug: string; productName: string } | null> {
  const db = await getDb();
  const now = Date.now();
  const id = newId();
  const statements: InStatement[] = [
    {
      sql: `INSERT INTO product_answers (id, question_id, user_id, body, is_staff, status, moderated_by, created_at, updated_at)
            SELECT ?, id, ?, ?, true, 'approved', ?, ?, ? FROM product_questions WHERE id = ? AND status <> 'hidden'`,
      args: [id, audit.actor.id, body, audit.actor.id, now, now, questionId],
    },
    withAudit(
      {
        sql: `UPDATE product_questions SET status = 'approved', moderated_by = ?, updated_at = ?
              WHERE id = ? AND EXISTS (SELECT 1 FROM product_answers WHERE id = ?)`,
        args: [audit.actor.id, now, questionId, id],
      },
      audit,
    ),
  ];
  const results = await db.batch(statements);
  if (results[0].rowsAffected === 0) return null;
  const row = (
    await db.execute({
      sql: "SELECT q.user_id, p.slug, p.name FROM product_questions q JOIN products p ON p.id = q.product_id WHERE q.id = ?",
      args: [questionId],
    })
  ).rows[0];
  return row ? { askerId: String(row.user_id), productSlug: String(row.slug), productName: String(row.name) } : null;
}

export async function setQuestionStatus(id: string, status: "approved" | "hidden", audit: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      { sql: "UPDATE product_questions SET status = ?, moderated_by = ?, updated_at = ? WHERE id = ? AND status <> ?", args: [status, audit.actor.id, Date.now(), id, status] },
      audit,
    ),
  );
  return result.rowsAffected > 0;
}

export async function setAnswerStatus(id: string, status: "approved" | "hidden", audit: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      { sql: "UPDATE product_answers SET status = ?, moderated_by = ?, updated_at = ? WHERE id = ? AND status <> ?", args: [status, audit.actor.id, Date.now(), id, status] },
      audit,
    ),
  );
  return result.rowsAffected > 0;
}

// Danh sách quản trị. "Cần xử lý": câu hỏi chờ duyệt, câu hỏi đang hiện chưa có trả lời của nhân viên, hoặc có câu trả lời
// của khách chờ duyệt. Còn lại lọc theo trạng thái câu hỏi.
export async function listQuestionsForAdmin(filter: "todo" | QaStatus, page: number, pageSize = 20): Promise<{ items: Question[]; total: number }> {
  const where =
    filter === "todo"
      ? `(q.status = 'pending'
          OR (q.status = 'approved' AND NOT EXISTS (SELECT 1 FROM product_answers a WHERE a.question_id = q.id AND a.is_staff AND a.status = 'approved'))
          OR EXISTS (SELECT 1 FROM product_answers a WHERE a.question_id = q.id AND a.status = 'pending'))`
      : "q.status = ?";
  const args = filter === "todo" ? [] : [filter];
  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*)::int AS n FROM product_questions q WHERE ${where}`, args },
    { sql: `${QUESTION_SQL} WHERE ${where} ORDER BY q.created_at DESC LIMIT ? OFFSET ?`, args: [...args, pageSize, (Math.max(page, 1) - 1) * pageSize] },
  ]);
  return { total: Number(count.rows[0].n), items: await attachAnswers(rows.rows, false) };
}

// Đếm cho thông báo quản trị (khớp bộ lọc "Cần xử lý").
export const QA_TODO_COUNT_SQL = `SELECT COUNT(*) AS n FROM product_questions q WHERE q.status = 'pending'
  OR (q.status = 'approved' AND NOT EXISTS (SELECT 1 FROM product_answers a WHERE a.question_id = q.id AND a.is_staff AND a.status = 'approved'))
  OR EXISTS (SELECT 1 FROM product_answers a WHERE a.question_id = q.id AND a.status = 'pending')`;
