import "server-only";
import type { OAuthProfile, OAuthProvider } from "../auth/oauth";
import { getDb, isConstraintError } from "../db";
import { newId } from "../ids";
import { auditStatement } from "./audit";

// Danh tính đăng nhập ngoài (bảng oauth_identities, nghiep-vu-ban-hang mục 14).

export type OAuthOutcome =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; reason: "staff" | "locked" | "email_taken" | "no_email" | "linked_elsewhere" };

// Quyết định đăng nhập vào tài khoản nào:
// 1. Danh tính đã liên kết: đúng tài khoản đó (phải là khách đang hoạt động).
// 2. Chưa liên kết, có tài khoản cùng email: chỉ tự liên kết khi nhà cung cấp xác nhận email (Google); nếu không thì bắt
//    khách đăng nhập bằng mật khẩu rồi liên kết ở Cài đặt (tránh chiếm tài khoản bằng một email chưa xác minh).
// 3. Chưa có tài khoản: tạo tài khoản khách mới (mật khẩu ngẫu nhiên, khách đặt mật khẩu qua "Quên mật khẩu" nếu cần).
export async function resolveOAuthUser(profile: OAuthProfile, randomPasswordHash: string): Promise<OAuthOutcome> {
  const db = await getDb();
  const linked = await db.execute({
    sql: "SELECT u.id, u.role, u.is_active FROM oauth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = ? AND i.subject = ?",
    args: [profile.provider, profile.subject],
  });
  const own = linked.rows[0];
  if (own) {
    if (own.role !== "customer") return { ok: false, reason: "staff" };
    if (own.is_active !== true) return { ok: false, reason: "locked" };
    return { ok: true, userId: String(own.id), created: false };
  }
  if (!profile.email) return { ok: false, reason: "no_email" };

  const existing = (await db.execute({ sql: "SELECT id, role, is_active FROM users WHERE email = ?", args: [profile.email] })).rows[0];
  if (existing) {
    if (existing.role !== "customer") return { ok: false, reason: "staff" };
    if (existing.is_active !== true) return { ok: false, reason: "locked" };
    if (!profile.emailVerified) return { ok: false, reason: "email_taken" };
    const result = await linkIdentity(String(existing.id), profile);
    if (result !== "ok") return { ok: false, reason: "linked_elsewhere" };
    await db.execute({ sql: "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", args: [Date.now(), String(existing.id)] });
    return { ok: true, userId: String(existing.id), created: false };
  }

  const id = newId();
  const now = Date.now();
  try {
    await db.batch([
      {
        // Google xác nhận email nên tài khoản tạo từ Google coi như đã xác thực email (mục 15).
        sql: `INSERT INTO users (id, email, name, phone, password_hash, role, marketing_consent, created_at, email_verified_at)
              VALUES (?, ?, ?, '', ?, 'customer', false, ?, ?)`,
        args: [id, profile.email, (profile.name || profile.email.split("@")[0]).slice(0, 80), randomPasswordHash, now, profile.emailVerified ? now : null],
      },
      { sql: "INSERT INTO oauth_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)", args: [profile.provider, profile.subject, id, profile.email, now] },
      auditStatement({ actor: { id, role: "customer" }, action: "customer.oauth_register", entity: "users", entityId: id, summary: `Đăng ký bằng ${profile.provider}` }),
    ]);
  } catch (error) {
    // Hai lượt cùng lúc với cùng email hoặc cùng danh tính: lượt sau thử lại từ đầu.
    if (isConstraintError(error)) return resolveOAuthUser(profile, randomPasswordHash);
    throw error;
  }
  return { ok: true, userId: id, created: true };
}

// Gắn danh tính vào một tài khoản (từ Cài đặt khi đã đăng nhập, hoặc lúc tự liên kết theo email đã xác minh). Mỗi tài khoản
// một danh tính cho mỗi nhà cung cấp; danh tính đã thuộc tài khoản khác thì từ chối.
export async function linkIdentity(userId: string, profile: OAuthProfile): Promise<"ok" | "linked_elsewhere"> {
  const db = await getDb();
  try {
    await db.batch([
      {
        sql: "INSERT INTO oauth_identities (provider, subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [profile.provider, profile.subject, userId, profile.email, Date.now()],
      },
      auditStatement({ actor: { id: userId, role: "customer" }, action: "customer.oauth_link", entity: "users", entityId: userId, summary: `Liên kết ${profile.provider}` }),
    ]);
    return "ok";
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const owner = await db.execute({ sql: "SELECT user_id FROM oauth_identities WHERE provider = ? AND subject = ?", args: [profile.provider, profile.subject] });
    return owner.rows[0] && String(owner.rows[0].user_id) === userId ? "ok" : "linked_elsewhere";
  }
}

export async function listIdentities(userId: string): Promise<{ provider: OAuthProvider; email: string; createdAt: number }[]> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT provider, email, created_at FROM oauth_identities WHERE user_id = ? ORDER BY provider", args: [userId] });
  return result.rows.map((row) => ({ provider: row.provider === "facebook" ? "facebook" : "google", email: String(row.email), createdAt: Number(row.created_at) }));
}

export async function unlinkIdentity(userId: string, provider: OAuthProvider): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({ sql: "DELETE FROM oauth_identities WHERE user_id = ? AND provider = ?", args: [userId, provider] });
  return result.rowsAffected > 0;
}
