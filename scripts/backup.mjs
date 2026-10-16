// Sao lưu mọi bảng của CSDL (DATABASE_URL) thành JSON trong data/backups/<thời điểm UTC>/ (YC-VH-01).
// Chạy: npm run backup. Chỉ đọc, không có lệnh khôi phục vào CSDL thật; cách khôi phục được diễn tập trong
// test/backup.test.ts. Thư mục data/ không nằm trong git: hãy chép bản sao lưu ra nơi an toàn.
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { dumpDatabase, writeBackup } from "./backup-lib.mjs";

const root = path.resolve(import.meta.dirname, "..");
const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error("Thiếu DATABASE_URL trong .env.local");
  process.exit(1);
}

// Cùng cách kết nối TLS với src/server/db/index.ts.
const { hostname } = new URL(connectionString);
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const caFile =
  process.env.DATABASE_CA_CERT?.trim() || (/\.supabase\.(com|co)$/.test(hostname) ? path.join(root, "certs/supabase-ca.crt") : "");
const client = new pg.Client({ connectionString, ssl: isLocal ? false : caFile ? { ca: readFileSync(caFile, "utf8") } : true });

await client.connect();
try {
  // Một giao dịch REPEATABLE READ chỉ đọc: mọi bảng cùng một thời điểm, khớp nhau.
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const dump = await dumpDatabase((text, values) => client.query(text, values));
  await client.query("COMMIT");
  const dir = path.join(root, "data", "backups", new Date().toISOString().replace(/[:.]/g, "-"));
  await writeBackup(dir, dump);
  const rows = Object.values(dump.tables).reduce((sum, list) => sum + list.length, 0);
  console.log(`Đã sao lưu ${Object.keys(dump.tables).length} bảng, ${rows} dòng vào ${path.relative(root, dir)}`);
} finally {
  await client.end();
}
