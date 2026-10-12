import "server-only";
import { getDb } from "../db";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

// Đếm số lần thử theo khoá trong một cửa sổ thời gian cố định. Bộ đếm nằm trong CSDL nên vẫn đúng
// khi ứng dụng chạy nhiều tiến trình hoặc vừa khởi động lại.
export async function consumeRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const db = await getDb();
  const now = Date.now();
  const result = await db.execute({
    sql: `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
          ON CONFLICT (key) DO UPDATE SET
            count = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
            reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
          RETURNING count, reset_at`,
    args: [key, now + windowMs, now, now],
  });
  const row = result.rows[0];
  const count = Number(row.count);
  const resetAt = Number(row.reset_at);
  return {
    allowed: count <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

export async function resetRateLimit(key: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM rate_limits WHERE key = ?", args: [key] });
}
