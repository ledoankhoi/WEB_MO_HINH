// Sao lưu và khôi phục dữ liệu dạng JSON (YC-VH-01, OPS-01). Dùng chung cho scripts/backup.mjs và test.
// `query(text, values)` trả về `{ rows }` (pg hoặc PGlite). Lược đồ không sao lưu: khôi phục vào CSDL đã chạy
// đủ migration (src/server/db/migrations.ts), bảng `meta` ghi các migration đã chạy nằm trong bản sao lưu.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** @typedef {{ version: number, tables: Record<string, Record<string, unknown>[]> }} Dump */

const quote = (name) => `"${name.replace(/"/g, '""')}"`;

// bytea thành base64; BIGINT (nếu trình điều khiển trả về kiểu bigint) thành chuỗi.
function encode(value) {
  if (value instanceof Uint8Array) return { $bytea: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return value.toString();
  return value;
}
const decode = (value) => (value && typeof value === "object" && typeof value.$bytea === "string" ? Buffer.from(value.$bytea, "base64") : value);

async function listTables(query) {
  const result = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  return result.rows.map((row) => row.table_name);
}

/** @returns {Promise<Dump>} */
export async function dumpDatabase(query) {
  /** @type {Dump["tables"]} */
  const tables = {};
  for (const table of await listTables(query)) {
    // Thứ tự ổn định theo cột đầu tiên để hai bản sao lưu cùng dữ liệu giống hệt nhau.
    const result = await query(`SELECT * FROM ${quote(table)} ORDER BY 1`);
    tables[table] = result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, encode(value)])));
  }
  return { version: 1, tables };
}

// Mỗi bảng một file JSON, kèm manifest.json (số dòng từng bảng).
export async function writeBackup(dir, dump) {
  await mkdir(dir, { recursive: true });
  for (const [table, rows] of Object.entries(dump.tables)) await writeFile(path.join(dir, `${table}.json`), JSON.stringify(rows));
  const counts = Object.fromEntries(Object.entries(dump.tables).map(([table, rows]) => [table, rows.length]));
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify({ version: dump.version, counts }, null, 2));
}

/** @returns {Promise<Dump>} */
export async function readBackup(dir) {
  const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  /** @type {Dump["tables"]} */
  const tables = {};
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".json") && name !== "manifest.json").sort()) {
    tables[file.slice(0, -5)] = JSON.parse(await readFile(path.join(dir, file), "utf8"));
  }
  for (const [table, count] of Object.entries(manifest.counts)) {
    if (tables[table]?.length !== count) throw new Error(`Bản sao lưu hỏng: bảng ${table} có ${tables[table]?.length ?? 0} dòng, manifest ghi ${count}`);
  }
  return { version: manifest.version, tables };
}

// Chỉ dùng trong diễn tập khôi phục (test). Phải chạy trong một giao dịch, với quyền superuser: tạm tắt kiểm tra
// khoá ngoại để nạp bảng theo thứ tự bất kỳ, xoá sạch rồi nạp lại, đặt lại bộ đếm của cột identity.
export async function restoreDatabase(query, dump) {
  const tables = Object.keys(dump.tables);
  const existing = new Set(await listTables(query));
  const missing = tables.filter((table) => !existing.has(table));
  if (missing.length) throw new Error(`CSDL đích thiếu bảng: ${missing.join(", ")}; hãy chạy migration trước`);
  await query("SET LOCAL session_replication_role = replica");
  await query(`TRUNCATE ${tables.map(quote).join(", ")}`);
  for (const table of tables) {
    for (const row of dump.tables[table]) {
      const columns = Object.keys(row);
      await query(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) OVERRIDING SYSTEM VALUE VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        columns.map((column) => decode(row[column])),
      );
    }
  }
  const identities = await query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND is_identity = 'YES'");
  for (const { table_name: table, column_name: column } of identities.rows) {
    await query(
      `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${quote(column)}) FROM ${quote(table)}), 1), (SELECT MAX(${quote(column)}) FROM ${quote(table)}) IS NOT NULL)`,
      [table, column],
    );
  }
  await query("SET LOCAL session_replication_role = origin");
}
