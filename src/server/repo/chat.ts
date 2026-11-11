import "server-only";
import { getDb, isConstraintError, type Row } from "../db";
import { newId } from "../ids";

// Chat với cửa hàng (nghiep-vu-ban-hang mục 16). Mỗi khách một cuộc trò chuyện: theo tài khoản nếu đã đăng nhập, theo token
// trong cookie nếu là khách vãng lai. Trình duyệt hỏi tin mới định kỳ (GET /api/chat), nhân viên trả lời ở /admin/chat.

export const CHAT_MAX_LENGTH = 1000;

export type ChatOwner = { userId: string; name: string } | { visitorHash: string };
export type ChatMessage = { id: number; sender: "customer" | "staff"; body: string; createdAt: number; staffName: string | null };
export type ChatThread = {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  status: "open" | "closed";
  lastMessageAt: number;
  lastSender: "customer" | "staff";
  // Tin của khách mà nhân viên chưa đọc.
  unread: number;
  preview: string;
};

const ownerWhere = (owner: ChatOwner) => ("userId" in owner ? { sql: "user_id = ?", arg: owner.userId } : { sql: "visitor_hash = ?", arg: owner.visitorHash });

export async function findThreadId(owner: ChatOwner): Promise<string | null> {
  const db = await getDb();
  const where = ownerWhere(owner);
  const row = (await db.execute({ sql: `SELECT id FROM chat_threads WHERE ${where.sql}`, args: [where.arg] })).rows[0];
  return row ? String(row.id) : null;
}

// Khách gửi tin: tạo cuộc trò chuyện nếu chưa có, mở lại nếu đã đóng.
export async function postCustomerMessage(owner: ChatOwner, body: string, now = Date.now()): Promise<string> {
  const db = await getDb();
  let threadId = await findThreadId(owner);
  if (!threadId) {
    threadId = newId();
    try {
      await db.execute({
        sql: "INSERT INTO chat_threads (id, user_id, visitor_hash, name, last_message_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        args: [threadId, "userId" in owner ? owner.userId : null, "visitorHash" in owner ? owner.visitorHash : null, "userId" in owner ? owner.name : "", now, now],
      });
    } catch (error) {
      // Hai tin đầu tiên gửi cùng lúc: dùng cuộc trò chuyện vừa được tạo.
      if (!isConstraintError(error)) throw error;
      threadId = (await findThreadId(owner))!;
    }
  }
  await db.batch([
    { sql: "INSERT INTO chat_messages (thread_id, sender, body, created_at) VALUES (?, 'customer', ?, ?)", args: [threadId, body, now] },
    {
      sql: "UPDATE chat_threads SET status = 'open', last_message_at = ?, last_sender = 'customer', customer_read_at = ? WHERE id = ?",
      args: [now, now, threadId],
    },
  ]);
  return threadId;
}

export async function postStaffMessage(threadId: string, staffId: string, body: string, now = Date.now()): Promise<boolean> {
  const db = await getDb();
  const results = await db.batch([
    { sql: "INSERT INTO chat_messages (thread_id, sender, staff_id, body, created_at) SELECT id, 'staff', ?, ?, ? FROM chat_threads WHERE id = ?", args: [staffId, body, now, threadId] },
    { sql: "UPDATE chat_threads SET status = 'open', last_message_at = ?, last_sender = 'staff', staff_read_at = ? WHERE id = ?", args: [now, now, threadId] },
  ]);
  return results[0].rowsAffected > 0;
}

function toMessage(row: Row): ChatMessage {
  return {
    id: Number(row.id),
    sender: row.sender === "staff" ? "staff" : "customer",
    body: String(row.body),
    createdAt: Number(row.created_at),
    staffName: row.staff_name === null || row.staff_name === undefined ? null : String(row.staff_name),
  };
}

// Tin sau `afterId` (0: 100 tin gần nhất). Khách xem thì đánh dấu đã đọc tin của nhân viên.
export async function listMessages(threadId: string, afterId: number, reader: "customer" | "staff" | null, now = Date.now()): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.execute({
    sql: `SELECT * FROM (SELECT m.*, u.name AS staff_name FROM chat_messages m LEFT JOIN users u ON u.id = m.staff_id
                         WHERE m.thread_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 100) t ORDER BY id`,
    args: [threadId, afterId],
  });
  if (reader) {
    await db.execute({ sql: `UPDATE chat_threads SET ${reader === "customer" ? "customer_read_at" : "staff_read_at"} = ? WHERE id = ?`, args: [now, threadId] });
  }
  return rows.rows.map(toMessage);
}

// Số tin của nhân viên khách chưa đọc (huy hiệu trên nút chat).
export async function countUnreadForCustomer(threadId: string): Promise<number> {
  const db = await getDb();
  const row = (
    await db.execute({
      sql: `SELECT COUNT(*)::int AS n FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
            WHERE t.id = ? AND m.sender = 'staff' AND m.created_at > t.customer_read_at`,
      args: [threadId],
    })
  ).rows[0];
  return Number(row?.n ?? 0);
}

const UNREAD_STAFF = `(SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.sender = 'customer' AND m.created_at > t.staff_read_at)::int`;

const THREAD_SELECT = `SELECT t.*, u.email, COALESCE(NULLIF(t.name, ''), u.name, '') AS display_name, ${UNREAD_STAFF} AS unread,
                 (SELECT body FROM chat_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS preview
          FROM chat_threads t LEFT JOIN users u ON u.id = t.user_id`;

export async function findThread(id: string): Promise<ChatThread | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: `${THREAD_SELECT} WHERE t.id = ?`, args: [id] })).rows[0];
  return row ? toThread(row) : null;
}

export async function listThreads(status: "open" | "closed", limit = 50): Promise<ChatThread[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `${THREAD_SELECT} WHERE t.status = ? ORDER BY (t.last_sender = 'customer') DESC, t.last_message_at DESC LIMIT ?`,
    args: [status, limit],
  });
  return result.rows.map(toThread);
}

function toThread(row: Row): ChatThread {
  return {
    id: String(row.id),
    userId: row.user_id === null ? null : String(row.user_id),
    name: String(row.display_name) || "Khách vãng lai",
    email: row.email === null || row.email === undefined ? null : String(row.email),
    status: row.status === "closed" ? "closed" : "open",
    lastMessageAt: Number(row.last_message_at),
    lastSender: row.last_sender === "staff" ? "staff" : "customer",
    unread: Number(row.unread),
    preview: String(row.preview ?? ""),
  };
}

export async function setThreadStatus(threadId: string, status: "open" | "closed"): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({ sql: "UPDATE chat_threads SET status = ? WHERE id = ? AND status <> ?", args: [status, threadId, status] });
  return result.rowsAffected > 0;
}

// Cuộc trò chuyện đang mở mà tin cuối là của khách (chờ cửa hàng trả lời): đếm cho thông báo quản trị.
export const CHAT_WAITING_SQL = "SELECT COUNT(*) AS n FROM chat_threads WHERE status = 'open' AND last_sender = 'customer'";
