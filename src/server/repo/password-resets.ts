import "server-only";
import { getDb } from "../db";

// Token đặt lại mật khẩu (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 2). Bảng chỉ lưu SHA-256 của token; token gốc chỉ
// nằm trong email. Mỗi tài khoản chỉ còn một token hiệu lực: tạo token mới thì xoá các token chưa dùng trước đó.

export const RESET_TTL_MINUTES = 30;

export async function findResetAccount(email: string): Promise<{ id: string; name: string; email: string } | null> {
  const db = await getDb();
  const row = (await db.execute({
    sql: "SELECT id, name, email FROM users WHERE email = ? AND is_active AND deleted_at IS NULL",
    args: [email],
  })).rows[0];
  return row ? { id: String(row.id), name: String(row.name), email: String(row.email) } : null;
}

export async function createReset(userId: string, tokenHash: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.batch([
    { sql: "DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", args: [userId] },
    {
      sql: "INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      args: [tokenHash, userId, now + RESET_TTL_MINUTES * 60 * 1000, now],
    },
  ]);
}

// Token còn dùng được: chưa dùng, chưa hết hạn, tài khoản còn hoạt động. Dùng đồng hồ CSDL.
export async function findValidReset(tokenHash: string): Promise<{ userId: string; name: string; email: string } | null> {
  const db = await getDb();
  const row = (await db.execute({
    sql: `SELECT r.user_id, u.name, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
          WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > extract(epoch from now()) * 1000
            AND u.is_active AND u.deleted_at IS NULL`,
    args: [tokenHash],
  })).rows[0];
  return row ? { userId: String(row.user_id), name: String(row.name), email: String(row.email) } : null;
}

// Đổi mật khẩu bằng token: đánh dấu token đã dùng (chỉ thành công một lần), đặt mật khẩu mới, xoá mọi phiên đăng nhập,
// trong cùng một giao dịch. Trả về false nếu token vừa bị dùng ở yêu cầu khác.
export async function consumeReset(tokenHash: string, userId: string, passwordHash: string): Promise<boolean> {
  const db = await getDb();
  const [marked] = await db.batch([
    {
      sql: "UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND user_id = ? AND used_at IS NULL AND expires_at > extract(epoch from now()) * 1000",
      args: [Date.now(), tokenHash, userId],
    },
    {
      sql: `UPDATE users SET password_hash = ? WHERE id = ?
              AND EXISTS (SELECT 1 FROM password_resets WHERE token_hash = ? AND used_at IS NOT NULL)`,
      args: [passwordHash, userId, tokenHash],
    },
    {
      sql: "DELETE FROM sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM password_resets WHERE token_hash = ? AND used_at IS NOT NULL)",
      args: [userId, tokenHash],
    },
  ]);
  return marked.rowsAffected > 0;
}
