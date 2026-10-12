import { PGlite } from "@electric-sql/pglite";
import type { Backend } from "@/server/db";

type DbState = { backend?: Backend; ready?: unknown };

// Cho module CSDL dùng PGlite (PostgreSQL chạy trong bộ nhớ) thay cho máy chủ thật. Phải gọi trước lần
// truy vấn đầu tiên. Mỗi file test chạy trong một worker riêng nên có một CSDL riêng.
export function setupTempDatabase(): () => Promise<void> {
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;

  const pg = new PGlite();
  const state = ((globalThis as { __robostoreDb?: DbState }).__robostoreDb ??= {});
  state.ready = undefined;
  state.backend = {
    query: (text, values) => pg.query(text, values),
    transaction: (fn) => pg.transaction((tx) => fn((text, values) => tx.query(text, values))),
  };

  return async () => {
    state.ready = undefined;
    state.backend = undefined;
    await pg.close();
  };
}
