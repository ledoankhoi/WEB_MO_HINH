import "server-only";
import { createHash } from "node:crypto";
import { getDb, type InStatement } from "../db";
import { newId } from "../ids";

// Sổ xu (bảng coin_ledger, migration ext_01). Chỉ thêm dòng; số dư là tổng amount. Khoá duy nhất (user_id, reason, ref)
// làm mỗi phần thưởng chỉ ghi được một lần. Ngày theo giờ Việt Nam (UTC+7), lấy từ đồng hồ CSDL.

export const TODAY_VN_SQL = "to_char(to_timestamp(extract(epoch from now()) + 25200) AT TIME ZONE 'UTC', 'YYYY-MM-DD')";

// Khoá tư vấn theo người dùng: các lần tiêu xu của cùng một người chạy lần lượt, không tiêu quá số dư khi bấm liên tục.
export function userLock(userId: string): InStatement {
  const key = createHash("sha256").update(`coins:${userId}`).digest().readBigInt64BE(0);
  return { sql: "SELECT pg_advisory_xact_lock(?::bigint)", args: [key.toString()] };
}

export async function getBalance(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT COALESCE(SUM(amount), 0)::int AS n FROM coin_ledger WHERE user_id = ?", args: [userId] });
  return Number(result.rows[0].n);
}

// Cộng xu một lần cho (reason, ref). Trả false nếu đã nhận trước đó.
export function creditStatement(userId: string, amount: number, reason: string, ref: string, note = ""): InStatement {
  return {
    sql: `INSERT INTO coin_ledger (id, user_id, amount, reason, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id, reason, ref) DO NOTHING`,
    args: [newId(), userId, amount, reason, ref, note, Date.now()],
  };
}

export async function credit(userId: string, amount: number, reason: string, ref: string, note = ""): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(creditStatement(userId, amount, reason, ref, note));
  return result.rowsAffected > 0;
}

// Câu trừ xu có điều kiện đủ số dư; dùng trong một lô có userLock ở đầu. rowsAffected = 0 nghĩa là không đủ xu.
export function spendStatement(userId: string, amount: number, reason: string, ref: string, note = ""): InStatement {
  return {
    sql: `INSERT INTO coin_ledger (id, user_id, amount, reason, ref, note, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE user_id = ?) >= ?`,
    args: [newId(), userId, -amount, reason, ref, note, Date.now(), userId, amount],
  };
}

export type LedgerEntry = { id: string; amount: number; reason: string; ref: string; note: string; createdAt: number };

export async function listLedger(userId: string, limit = 20): Promise<LedgerEntry[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, amount, reason, ref, note, created_at FROM coin_ledger WHERE user_id = ? ORDER BY created_at DESC, id LIMIT ?",
    args: [userId, limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    amount: Number(row.amount),
    reason: String(row.reason),
    ref: String(row.ref),
    note: String(row.note),
    createdAt: Number(row.created_at),
  }));
}
