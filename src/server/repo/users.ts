import "server-only";
import { withAudit, type AuditEntry } from "./audit";
import { isRole, type Role } from "@/lib/permissions";
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
    role: isRole(row.role) ? row.role : "customer",
    marketingConsent: Boolean(row.marketing_consent),
  };
}

// Chỉ dùng khi đăng nhập: đây là hàm duy nhất trả về password_hash.
export async function findCredentialsByEmail(
  email: string,
): Promise<{ id: string; passwordHash: string; role: Role; isActive: boolean } | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, password_hash, role, is_active FROM users WHERE email = ?",
    args: [email],
  });
  const row = result.rows[0];
  return row
    ? {
        id: String(row.id),
        passwordHash: String(row.password_hash),
        role: isRole(row.role) ? row.role : "customer",
        isActive: row.is_active === true,
      }
    : null;
}

export async function findPasswordHash(userId: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
  return result.rows[0] ? String(result.rows[0].password_hash) : null;
}

// Ném lỗi ràng buộc (xem isConstraintError) nếu email đã được đăng ký.
export async function insertUser(input: { email: string; name: string; phone: string; passwordHash: string; marketingConsent?: boolean }): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO users (id, email, name, phone, password_hash, role, marketing_consent, marketing_consent_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'customer', ?, ?, ?)`,
    args: [id, input.email, input.name, input.phone, input.passwordHash, Boolean(input.marketingConsent), input.marketingConsent ? now : null, now],
  });
  return id;
}

export async function updateUserProfile(
  userId: string,
  input: { name: string; phone: string; address: string; city: string; marketingConsent: boolean },
): Promise<void> {
  const db = await getDb();
  // Thời điểm đồng ý chỉ đổi khi đổi lựa chọn (YC-KH-04).
  await db.execute({
    sql: `UPDATE users SET name = ?, phone = ?, address = ?, city = ?,
            marketing_consent_at = CASE WHEN marketing_consent = ? THEN marketing_consent_at WHEN ? THEN ?::bigint ELSE NULL END,
            marketing_consent = ?
          WHERE id = ?`,
    args: [input.name, input.phone, input.address, input.city, input.marketingConsent, input.marketingConsent, Date.now(), input.marketingConsent, userId],
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
    sql: `SELECT u.id, u.email, u.name, u.phone, u.address, u.city, u.role, u.marketing_consent
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > extract(epoch from now()) * 1000 AND u.is_active`,
    // Dùng đồng hồ của CSDL: Date.now() trong lúc dựng trang bị Next.js coi là giá trị không ổn định.
    args: [sessionId],
  });
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
}

export type CustomerSummary = Pick<CurrentUser, "id" | "email" | "name" | "phone" | "city" | "marketingConsent"> & {
  isActive: boolean;
  marketingConsentAt: number | null;
  createdAt: number;
  orderCount: number;
  // Chỉ tính các đơn đã hoàn tất, giống doanh thu ở getOrderStats.
  spent: number;
};

export async function listCustomers(query: {
  q?: string;
  id?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CustomerSummary[]; total: number }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const where = ["u.role = 'customer'"];
  const args: (string | number)[] = [];
  if (query.id) {
    where.push("u.id = ?");
    args.push(query.id);
  }
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(u.name ILIKE ? ESCAPE '\\' OR u.email ILIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  const whereSql = where.join(" AND ");
  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      { sql: `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, args },
      {
        sql: `SELECT u.id, u.email, u.name, u.phone, u.city, u.created_at, u.is_active, u.marketing_consent, u.marketing_consent_at,
                (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count,
                (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = u.id AND status = 'completed') AS spent
              FROM users u WHERE ${whereSql} ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
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
      isActive: Boolean(row.is_active),
      marketingConsent: Boolean(row.marketing_consent),
      marketingConsentAt: row.marketing_consent_at === null ? null : Number(row.marketing_consent_at),
      createdAt: Number(row.created_at),
      orderCount: Number(row.order_count),
      spent: Number(row.spent),
    })),
    total: Number(count.rows[0].total),
  };
}

// Địa chỉ giao hàng khách đã dùng (lấy từ đơn; chưa có sổ địa chỉ).
export async function listCustomerAddresses(userId: string): Promise<{ name: string; phone: string; address: string; city: string }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT customer_name, customer_phone, shipping_address, shipping_city, MAX(created_at) AS last_used FROM orders WHERE user_id = ?
          GROUP BY customer_name, customer_phone, shipping_address, shipping_city ORDER BY last_used DESC LIMIT 10`,
    args: [userId],
  });
  return result.rows.map((row) => ({ name: String(row.customer_name), phone: String(row.customer_phone), address: String(row.shipping_address), city: String(row.shipping_city) }));
}

// YC-KH-03: khoá, mở khoá tài khoản khách; khoá thì xoá mọi phiên.
export async function setCustomerActive(userId: string, active: boolean, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const results = await db.batch([
    withAudit({ sql: "UPDATE users SET is_active = ? WHERE id = ? AND role = 'customer' AND is_active <> ?", args: [active, userId, active] }, entry),
    { sql: "DELETE FROM sessions WHERE user_id = ? AND NOT ?", args: [userId, active] },
  ]);
  return results[0].rowsAffected > 0;
}
