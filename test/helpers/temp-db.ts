import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import type { Backend } from "@/server/db";

type DbState = { backend?: Backend; ready?: unknown };

// Cho module CSDL dùng PGlite (PostgreSQL chạy trong bộ nhớ) thay cho máy chủ thật. Phải gọi trước lần
// truy vấn đầu tiên. Mỗi file test chạy trong một worker riêng nên có một CSDL riêng.
// Đặt TEST_DATABASE_URL (PostgreSQL thật, kết nối giữ phiên, không qua pooler chế độ transaction) thì mỗi file
// test chạy trong một schema tạm trên máy chủ đó, xoá khi xong: `npm run test:pg`.
// Hàm trả về dọn CSDL khi xong; kèm `pg` cho test cần truy vấn thẳng (ví dụ diễn tập khôi phục).
export function setupTempDatabase(): (() => Promise<void>) & { pg: PGlite } {
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;

  const state = ((globalThis as { __robostoreDb?: DbState }).__robostoreDb ??= {});
  state.ready = undefined;
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (url) return realDatabase(url, state);

  const pg = new PGlite();
  state.backend = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) => pg.transaction((tx) => fn((text, values) => tx.query(text, values))),
  };

  const cleanup = async () => {
    state.ready = undefined;
    state.backend = undefined;
    await pg.close();
  };
  return Object.assign(cleanup, { pg });
}

function realDatabase(url: string, state: DbState) {
  const schema = `test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const isSupabase = /\.supabase\.(com|co)$/.test(new URL(url).hostname);
  const ssl = isSupabase ? { ca: readFileSync(path.join(process.cwd(), "certs/supabase-ca.crt"), "utf8") } : undefined;
  const pool = new Pool({ connectionString: url, max: 4, ssl, options: `-c search_path=${schema}` });
  const created = pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  state.backend = {
    query: async (text, values) => (await created, pool.query(text, values)),
    async transaction(fn) {
      await created;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn((text, values) => client.query(text, values));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
  const cleanup = async () => {
    state.ready = undefined;
    state.backend = undefined;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
  };
  // Test dùng `pg` trực tiếp (diễn tập khôi phục) chỉ chạy trên PGlite.
  return Object.assign(cleanup, { pg: undefined as unknown as PGlite });
}
