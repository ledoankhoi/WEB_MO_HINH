import { afterAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb, initKeys } = await import("@/server/db");
afterAll(cleanup);

type State = { backend?: { query: unknown; transaction: (fn: unknown) => Promise<unknown> }; ready?: unknown };
const state = (globalThis as { __robostoreDb?: State }).__robostoreDb!;

describe("khởi tạo CSDL (src/server/db/index.ts)", () => {
  it("initKeys() khớp đúng các khoá mà lần khởi tạo đầy đủ ghi vào bảng meta", async () => {
    const db = await getDb();
    const written = (await db.execute("SELECT key FROM meta")).rows.map((row) => String(row.key));
    // Thiếu khoá trong initKeys() thì đường nhanh bỏ qua bước đó trên CSDL đã có; thừa thì không bao giờ đi đường nhanh.
    expect(written.toSorted()).toEqual(initKeys().toSorted());
  });

  it("CSDL đã khởi tạo đủ: lần khởi động sau chỉ đọc meta, không mở giao dịch hay giữ khoá", async () => {
    await getDb();
    const backend = state.backend!;
    const original = backend.transaction;
    let transactions = 0;
    backend.transaction = (fn) => {
      transactions++;
      return original(fn);
    };
    try {
      state.ready = undefined;
      const db = await getDb();
      expect(transactions).toBe(0);
      expect(Number((await db.execute("SELECT COUNT(*)::int AS n FROM products")).rows[0].n)).toBeGreaterThan(0);
    } finally {
      backend.transaction = original;
    }
  });

  it("thiếu một khoá (ví dụ có migration mới) thì đi đường đầy đủ và ghi lại khoá đó", async () => {
    const db = await getDb();
    const key = initKeys().at(-1)!;
    await db.execute({ sql: "DELETE FROM meta WHERE key = ?", args: [key] });
    state.ready = undefined;
    const again = await getDb();
    expect((await again.execute({ sql: "SELECT COUNT(*)::int AS n FROM meta WHERE key = ?", args: [key] })).rows[0].n).toBe(1);
  });
});
