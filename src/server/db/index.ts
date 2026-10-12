import "server-only";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { foldText } from "@/lib/format";
import { hashPassword, isValidPassword } from "../auth/password";
import { newId } from "../ids";
import { MIGRATIONS } from "./migrations";
import { SEED_PRODUCTS } from "./seed-data";

export type InValue = string | number | boolean | null | Uint8Array;
export type Row = Record<string, unknown>;
// Câu lệnh dùng dấu ? cho tham số; lớp này tự đổi sang $1, $2... của PostgreSQL.
export type InStatement = string | { sql: string; args?: InValue[] };
export type ResultSet = { rows: Row[]; rowsAffected: number };

type Query = (text: string, values?: unknown[]) => Promise<{ rows: Row[]; rowCount?: number | null; affectedRows?: number }>;

// Phần tối thiểu cần ở trình điều khiển. Ứng dụng dùng `pg`; test thay bằng PGlite.
export type Backend = {
  query: Query;
  transaction<T>(fn: (query: Query) => Promise<T>): Promise<T>;
};

export type Db = {
  execute(statement: InStatement): Promise<ResultSet>;
  // Chạy cả lô trong một giao dịch: lỗi ở lệnh nào thì huỷ toàn bộ, lỗi mang theo `statementIndex`.
  batch(statements: InStatement[]): Promise<ResultSet[]>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const INIT_LOCK = 7291801;
const SEED_KEY = "seed:catalog";

type DbState = { backend?: Backend; ready?: Promise<Db> };
const globalState = globalThis as unknown as { __robostoreDb?: DbState };
const state = (globalState.__robostoreDb ??= {});

function connect(): Backend {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("Thiếu biến môi trường DATABASE_URL (chuỗi kết nối PostgreSQL). Xem hướng dẫn trong README.md.");
  }
  const caFile = process.env.DATABASE_CA_CERT?.trim();
  const pool = new Pool({
    connectionString,
    // Mỗi tiến trình giữ ít kết nối để nhiều worker của `next build` không vượt giới hạn của máy chủ CSDL.
    max: 3,
    ...(caFile ? { ssl: { ca: readFileSync(caFile, "utf8") } } : {}),
  });
  // Kết nối rảnh bị máy chủ ngắt sẽ phát sự kiện lỗi; không bắt thì tiến trình Node dừng hẳn.
  pool.on("error", (error) => console.error("[robotica] Lỗi kết nối CSDL:", error.message));

  return {
    query: (text, values) => pool.query(text, values),
    async transaction(fn) {
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
}

async function run(query: Query, statement: InStatement): Promise<ResultSet> {
  const { sql, args = [] } = typeof statement === "string" ? { sql: statement } : statement;
  let index = 0;
  const result = await query(
    sql.replace(/\?/g, () => `$${++index}`),
    args,
  );
  return { rows: result.rows, rowsAffected: result.rowCount ?? result.affectedRows ?? 0 };
}

function wrap(backend: Backend): Db {
  return {
    execute: (statement) => run(backend.query, statement),
    batch: (statements) =>
      backend.transaction(async (query) => {
        const results: ResultSet[] = [];
        for (const [index, statement] of statements.entries()) {
          try {
            results.push(await run(query, statement));
          } catch (error) {
            if (error instanceof Error) (error as Error & { statementIndex?: number }).statementIndex = index;
            throw error;
          }
        }
        return results;
      }),
  };
}

// Mã lỗi lớp 23 của PostgreSQL: vi phạm UNIQUE, CHECK, NOT NULL...
export function isConstraintError(error: unknown): error is Error & { statementIndex?: number } {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.startsWith("23");
}

// Tạo bảng và nạp dữ liệu mẫu. Khoá tư vấn (advisory lock) bảo đảm khi nhiều tiến trình cùng khởi động
// thì chỉ một bên thực hiện, các bên còn lại chờ rồi thấy việc đã xong.
async function migrateAndSeed(backend: Backend) {
  await backend.transaction(async (query) => {
    const exec = (statement: InStatement) => run(query, statement);
    await exec({ sql: "SELECT pg_advisory_xact_lock(?)", args: [INIT_LOCK] });
    await exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const done = new Set((await exec("SELECT key FROM meta")).rows.map((row) => String(row.key)));
    const mark = (key: string) =>
      exec({ sql: "INSERT INTO meta (key, value) VALUES (?, ?)", args: [key, new Date().toISOString()] });

    for (const migration of MIGRATIONS) {
      const key = `migration:${migration.id}`;
      if (done.has(key)) continue;
      for (const statement of migration.statements) await exec(statement);
      await mark(key);
    }

    if (done.has(SEED_KEY)) return;
    // Mốc thời gian cố định để thứ tự "mới nhất" của dữ liệu mẫu luôn giống nhau.
    const base = Date.UTC(2026, 8, 1);
    for (const [index, p] of SEED_PRODUCTS.entries()) {
      const createdAt = base - index * DAY_MS;
      await exec({
        sql: `INSERT INTO products (
                id, slug, name, tagline, description, category, price, compare_at_price, stock,
                model, color_primary, color_secondary, color_accent, specs, image, search_text,
                is_featured, is_active, sold, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        args: [
          newId(),
          p.slug,
          p.name,
          p.tagline,
          p.description,
          p.category,
          p.price,
          p.compareAtPrice,
          p.stock,
          p.model,
          p.colors.primary,
          p.colors.secondary,
          p.colors.accent,
          JSON.stringify(p.specs),
          `/products/${p.slug}.webp`,
          foldText(`${p.name} ${p.tagline} ${p.description}`),
          p.featured ? 1 : 0,
          createdAt,
          createdAt,
        ],
      });
    }
    await mark(SEED_KEY);
  });
}

// Tạo tài khoản quản trị đầu tiên từ biến môi trường. Không tự nâng quyền tài khoản đã tồn tại.
async function ensureAdmin(db: Db) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;

  const existing = await db.execute({ sql: "SELECT role FROM users WHERE email = ?", args: [email] });
  if (existing.rows.length > 0) {
    if (existing.rows[0].role !== "admin") {
      console.warn(`[robotica] Tài khoản ${email} đã tồn tại nhưng không phải quản trị viên.`);
    }
    return;
  }

  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!isValidPassword(password)) {
    console.warn("[robotica] Bỏ qua tạo tài khoản quản trị: ADMIN_PASSWORD phải dài từ 8 đến 128 ký tự.");
    return;
  }

  await db.execute({
    sql: `INSERT INTO users (id, email, name, password_hash, role, created_at)
          VALUES (?, ?, ?, ?, 'admin', ?) ON CONFLICT (email) DO NOTHING`,
    args: [newId(), email, "Quản trị viên", await hashPassword(password), Date.now()],
  });
}

async function initialize(): Promise<Db> {
  const backend = state.backend ?? connect();
  await migrateAndSeed(backend);
  const db = wrap(backend);
  await ensureAdmin(db);
  const now = Date.now();
  await db.batch([
    { sql: "DELETE FROM sessions WHERE expires_at < ?", args: [now] },
    { sql: "DELETE FROM rate_limits WHERE reset_at < ?", args: [now] },
  ]);
  return db;
}

// Trả về kết nối đã sẵn sàng (đã tạo bảng và dữ liệu mẫu). Lần gọi đầu tiên trong tiến trình sẽ khởi tạo.
export function getDb(): Promise<Db> {
  if (!state.ready) {
    state.ready = initialize().catch((error) => {
      state.ready = undefined;
      throw error;
    });
  }
  return state.ready;
}
