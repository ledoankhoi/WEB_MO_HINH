// Chạy bộ test Vitest trên PostgreSQL thật (DATABASE_URL), mỗi file test một schema tạm, xoá khi xong.
// Pooler Supabase chế độ transaction (cổng 6543) không giữ search_path, nên đổi sang chế độ session (cổng 5432).
// Chạy tuần tự: mọi schema dùng chung khoá tư vấn lúc chạy migration, chạy song song thì chờ nhau tới quá statement_timeout.
// Bỏ qua backup.test.ts (cần quyền superuser để khôi phục, chỉ chạy trên PGlite). Chạy: npm run test:pg [-- file...]
import { spawnSync } from "node:child_process";

const raw = process.env.DATABASE_URL?.trim();
if (!raw) {
  console.error("Thiếu DATABASE_URL trong .env.local");
  process.exit(1);
}
const url = new URL(raw);
if (url.port === "6543") url.port = "5432";
const args = process.argv.slice(2);
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "--exclude", "test/backup.test.ts", "--no-file-parallelism", "--testTimeout", "600000", "--hookTimeout", "300000", ...args],
  { stdio: "inherit", env: { ...process.env, TEST_DATABASE_URL: url.toString() } },
);
process.exit(result.status ?? 1);
