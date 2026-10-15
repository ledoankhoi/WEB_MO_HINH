import "server-only";
import type { CurrentUser } from "@/lib/types";
import { getDb, type Row } from "../db";
import { newId } from "../ids";

function toUser(row: Row): CurrentUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    phone: String(row.phone),
    address: String(row.address),
    city: String(row.city),
    role: row.role === "admin" ? "admin" : "customer",
  };
}

// Chỉ dùng khi đăng nhập: đây là hàm duy nhất trả về password_hash.
export async function findCredentialsByEmail(
  email: string,
): Promise<{ id: string; passwordHash: string; isAdmin: boolean } | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT id, password_hash, role FROM users WHERE email = ?", args: [email] });
  const row = result.rows[0];
  return row ? { id: String(row.id), passwordHash: String(row.password_hash), isAdmin: row.role === "admin" } : null;
}

export async function findPasswordHash(userId: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
  return result.rows[0] ? String(result.rows[0].password_hash) : null;
}

// Ném lỗi ràng buộc (xem isConstraintError) nếu email đã được đăng ký.
export async function insertUser(input: { email: string; name: string; phone: string; passwordHash: string }): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.execute({
    sql: `INSERT INTO users (id, email, name, phone, password_hash, role, created_at)
          VALUES (?, ?, ?, ?, ?, 'customer', ?)`,
    args: [id, input.email, input.name, input.phone, input.passwordHash, Date.now()],
  });
  return id;
}

export async function updateUserProfile(
  userId: string,
  input: { name: string; phone: string; address: string; city: string },
): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "UPDATE users SET name = ?, phone = ?, address = ?, city = ? WHERE id = ?",
    args: [input.name, input.phone, input.address, input.city, userId],
  });
}

// Đổi mật khẩu và đăng xuất mọi phiên khác của tài khoản trong cùng một giao dịch.
export async function updateUserPassword(userId: string, passwordHash: string, keepSessionId: string | null): Promise<void> {
  const db = await getDb();
  await db.batch(
    [
      { sql: "UPDATE users SET password_hash = ? WHERE id = ?", args: [passwordHash, userId] },
      { sql: "DELETE FROM sessions WHERE user_id = ? AND id <> ?", args: [userId, keepSessionId ?? ""] },
    ]
  );
}

export async function insertSession(sessionId: string, userId: string, expiresAt: number): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sessionId, userId, expiresAt, Date.now()],
  });
}

export async function findSessionUser(sessionId: string): Promise<CurrentUser | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.phone, u.address, u.city, u.role
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > extract(epoch from now()) * 1000`,
    // Dùng đồng hồ của CSDL: Date.now() trong lúc dựng trang bị Next.js coi là giá trị không ổn định.
    args: [sessionId],
  });
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
}

export type CustomerSummary = Pick<CurrentUser, "id" | "email" | "name" | "phone" | "city"> & {
  createdAt: number;
  orderCount: number;
  // Chỉ tính các đơn đã hoàn tất, giống doanh thu ở getOrderStats.
  spent: number;
};

export async function listCustomers(query: {
  page?: number;
  pageSize?: number;
}): Promise<{ items: CustomerSummary[]; total: number }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      "SELECT COUNT(*) AS total FROM users WHERE role = 'customer'",
      {
        sql: `SELECT u.id, u.email, u.name, u.phone, u.city, u.created_at,
                (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count,
                (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = u.id AND status = 'completed') AS spent
              FROM users u WHERE u.role = 'customer' ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`,
        args: [pageSize, (page - 1) * pageSize],
      },
    ]
  );
  return {
    items: rows.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      phone: String(row.phone),
      city: String(row.city),
      createdAt: Number(row.created_at),
      orderCount: Number(row.order_count),
      spent: Number(row.spent),
    })),
    total: Number(count.rows[0].total),
  };
}

export async function countUsers(): Promise<number> {
  const db = await getDb();
  const result = await db.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'customer'");
  return Number(result.rows[0].total);
}
