import "server-only";
import { randomInt } from "node:crypto";
import { getDb } from "../db";
import { newId, sha256 } from "../ids";

// Mã OTP gửi qua email (nghiep-vu-ban-hang mục 15): xác thực email khi đăng ký, xác nhận đơn COD giá trị lớn. Chỉ lưu băm
// SHA-256 (kèm mục đích và địa chỉ nhận), hết hạn sau OTP_TTL_MS, sai quá OTP_MAX_ATTEMPTS lần thì phải xin mã mới, gửi lại
// sau OTP_RESEND_MS. Mã mới làm mọi mã cũ cùng mục đích, cùng địa chỉ hết dùng được.

export type OtpPurpose = "verify_email" | "cod_order";
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

const hash = (purpose: OtpPurpose, target: string, code: string) => sha256(`${purpose}:${target}:${code}`);

export async function issueOtp(purpose: OtpPurpose, target: string, now = Date.now()): Promise<{ ok: true; code: string } | { ok: false; retryAfterSeconds: number }> {
  const db = await getDb();
  const last = await db.execute({
    sql: "SELECT created_at FROM otp_codes WHERE purpose = ? AND target = ? ORDER BY created_at DESC LIMIT 1",
    args: [purpose, target],
  });
  const lastAt = last.rows[0] ? Number(last.rows[0].created_at) : 0;
  if (now - lastAt < OTP_RESEND_MS) return { ok: false, retryAfterSeconds: Math.ceil((OTP_RESEND_MS - (now - lastAt)) / 1000) };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.batch([
    { sql: "UPDATE otp_codes SET used_at = ? WHERE purpose = ? AND target = ? AND used_at IS NULL", args: [now, purpose, target] },
    {
      sql: "INSERT INTO otp_codes (id, purpose, target, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [newId(), purpose, target, hash(purpose, target, code), now + OTP_TTL_MS, now],
    },
  ]);
  return { ok: true, code };
}

export type OtpCheck = { ok: true; id: string } | { ok: false; reason: "invalid" | "expired" | "locked" | "missing" };

// Kiểm mã (chưa đánh dấu đã dùng: gọi consumeOtp sau khi việc cần xác nhận đã xong). Nhập sai thì tăng số lần sai.
export async function checkOtp(purpose: OtpPurpose, target: string, code: string, now = Date.now()): Promise<OtpCheck> {
  const db = await getDb();
  const row = (
    await db.execute({
      sql: "SELECT id, code_hash, attempts, expires_at FROM otp_codes WHERE purpose = ? AND target = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
      args: [purpose, target],
    })
  ).rows[0];
  if (!row) return { ok: false, reason: "missing" };
  if (Number(row.expires_at) <= now) return { ok: false, reason: "expired" };
  if (Number(row.attempts) >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  if (!/^\d{6}$/.test(code) || hash(purpose, target, code) !== String(row.code_hash)) {
    await db.execute({ sql: "UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?", args: [String(row.id)] });
    return { ok: false, reason: Number(row.attempts) + 1 >= OTP_MAX_ATTEMPTS ? "locked" : "invalid" };
  }
  return { ok: true, id: String(row.id) };
}

// Đánh dấu đã dùng; false nếu mã vừa được dùng ở một yêu cầu khác.
export async function consumeOtp(id: string, now = Date.now()): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({ sql: "UPDATE otp_codes SET used_at = ? WHERE id = ? AND used_at IS NULL", args: [now, id] });
  return result.rowsAffected > 0;
}

export async function markEmailVerified(userId: string, now = Date.now()): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", args: [now, userId] });
}

export const OTP_MESSAGES: Record<Exclude<OtpCheck, { ok: true }>["reason"], string> = {
  invalid: "Mã xác thực không đúng.",
  expired: "Mã xác thực đã hết hạn. Vui lòng gửi mã mới.",
  locked: "Bạn nhập sai quá nhiều lần. Vui lòng gửi mã mới.",
  missing: "Chưa có mã xác thực. Vui lòng bấm gửi mã.",
};
