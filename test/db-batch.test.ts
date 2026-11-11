import { afterAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb, isReadOnly } = await import("@/server/db");
afterAll(cleanup);

describe("db.batch: lô câu đọc chạy song song, lô có ghi chạy trong giao dịch (src/server/db/index.ts)", () => {
  it("chỉ coi là câu đọc khi bắt đầu bằng SELECT/WITH và không ghi, không khoá", () => {
    expect(isReadOnly("SELECT COUNT(*) FROM orders")).toBe(true);
    expect(isReadOnly({ sql: "  with t AS (SELECT 1) SELECT * FROM t WHERE x = ?", args: [1] })).toBe(true);
    expect(isReadOnly("SELECT updated_at, created_at FROM products")).toBe(true);
    // Cần giao dịch: khoá dòng, khoá tư vấn, ghi trong CTE, câu ghi.
    expect(isReadOnly("SELECT id FROM orders WHERE id = ? FOR UPDATE")).toBe(false);
    expect(isReadOnly("SELECT id FROM orders FOR NO KEY UPDATE")).toBe(false);
    expect(isReadOnly("SELECT id FROM orders FOR SHARE")).toBe(false);
    expect(isReadOnly("SELECT pg_advisory_xact_lock(?::bigint)")).toBe(false);
    expect(isReadOnly("WITH moved AS (DELETE FROM carts RETURNING *) SELECT COUNT(*) FROM moved")).toBe(false);
    expect(isReadOnly("INSERT INTO meta (key, value) VALUES ('a', 'b')")).toBe(false);
    expect(isReadOnly("UPDATE orders SET note = ''")).toBe(false);
    // Từ khoá trong chuỗi chỉ làm lô chạy trong giao dịch như cũ (an toàn).
    expect(isReadOnly("SELECT COUNT(*) FROM audit_logs WHERE action = 'product.delete'")).toBe(false);
  });

  it("lô câu đọc trả kết quả đúng thứ tự; câu lỗi mang statementIndex", async () => {
    const db = await getDb();
    const results = await db.batch(["SELECT 1 AS n", { sql: "SELECT ?::int + 1 AS n", args: [41] }, "SELECT 3 AS n"]);
    expect(results.map((result) => Number(result.rows[0].n))).toEqual([1, 42, 3]);
    await expect(db.batch(["SELECT 1", "SELECT * FROM bang_khong_co"])).rejects.toMatchObject({ statementIndex: 1 });
    expect(await db.batch([])).toEqual([]);
  });

  it("lô có ghi vẫn là một giao dịch: một câu lỗi thì huỷ cả lô", async () => {
    const db = await getDb();
    const key = `kiem-thu-batch-${Math.random().toString(36).slice(2)}`;
    await expect(
      db.batch([
        { sql: "INSERT INTO meta (key, value) VALUES (?, 'x')", args: [key] },
        { sql: "INSERT INTO meta (key, value) VALUES (?, 'y')", args: [key] },
      ]),
    ).rejects.toMatchObject({ statementIndex: 1 });
    const left = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM meta WHERE key = ?", args: [key] });
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
