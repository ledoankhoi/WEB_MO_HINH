import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { CATEGORIES } from "@/lib/catalog";
import { foldText, slugify } from "@/lib/format";
import { hashPassword, isValidPassword } from "../auth/password";
import { newId } from "../ids";
import { MIGRATIONS } from "./migrations";
import { SEED_BRANDS, SEED_PRODUCTS, SEED_SERIES } from "./seed-data";

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
// v1 là 12 robot tự dựng ban đầu; v2 là danh mục Gundam, Transformers... có mô hình .glb thật;
// v3 thêm các mô hình biến hình và hợp thể được (Combaticons, Bruticus, bộ G1).
const SEED_KEY = "seed:catalog-v3";
const V1_SEED_KEY = "seed:catalog";
const V2_SEED_KEY = "seed:catalog-v2";
const TAXONOMY_SEED_KEY = "seed:taxonomy-v1";

type DbState = { backend?: Backend; ready?: Promise<Db> };
const globalState = globalThis as unknown as { __robostoreDb?: DbState };
const state = (globalState.__robostoreDb ??= {});

function connect(): Backend {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("Thiếu biến môi trường DATABASE_URL (chuỗi kết nối PostgreSQL). Xem hướng dẫn trong README.md.");
  }
  // Máy chủ ở xa luôn phải dùng TLS có xác minh chứng chỉ: mặc định `pg` gửi mật khẩu không mã hoá.
  // Supabase ký chứng chỉ bằng CA riêng (certs/supabase-ca.crt); nơi khác dùng CA của hệ thống
  // hoặc file chỉ định trong DATABASE_CA_CERT.
  const { hostname } = new URL(connectionString);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const caFile =
    process.env.DATABASE_CA_CERT?.trim() ||
    (/\.supabase\.(com|co)$/.test(hostname) ? path.join(process.cwd(), "certs/supabase-ca.crt") : "");
  const pool = new Pool({
    connectionString,
    // Mỗi tiến trình giữ ít kết nối để nhiều worker của `next build` không vượt giới hạn của máy chủ CSDL.
    max: 3,
    // Mặc định `pg` đóng kết nối rảnh sau 10 giây; mở lại kết nối TLS tới máy chủ ở xa mất gần 1 giây,
    // nên người dùng thao tác thưa sẽ luôn gặp độ trễ đó. Giữ kết nối rảnh 5 phút.
    idleTimeoutMillis: 5 * 60 * 1000,
    ssl: isLocal ? false : caFile ? { ca: readFileSync(caFile, "utf8") } : true,
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
    // Tiến trình bị tắt giữa chừng thì bộ đệm kết nối (Supavisor) vẫn giữ giao dịch và khoá bên dưới;
    // giới hạn này để máy chủ CSDL tự huỷ giao dịch bỏ dở thay vì chặn lần khởi động sau.
    await exec("SET LOCAL idle_in_transaction_session_timeout = '30s'");
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

    if (!done.has(TAXONOMY_SEED_KEY)) {
      for (const [index, c] of CATEGORIES.entries()) {
        await exec({
          sql: `INSERT INTO categories (id, slug, name, description, sort_order) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (slug) DO NOTHING`,
          args: [newId(), c.slug, c.name, c.description, index],
        });
      }
      for (const [table, names] of [["brands", SEED_BRANDS], ["series", SEED_SERIES]] as const) {
        for (const name of names) {
          await exec({
            sql: `INSERT INTO ${table} (id, slug, name) VALUES (?, ?, ?) ON CONFLICT (slug) DO NOTHING`,
            args: [newId(), slugify(name), name],
          });
        }
      }
      await mark(TAXONOMY_SEED_KEY);
    }

    if (done.has(SEED_KEY)) return;
    // Ẩn danh mục v1 thay vì xoá, để các đơn hàng cũ vẫn trỏ được tới sản phẩm.
    if (done.has(V1_SEED_KEY) && !done.has(V2_SEED_KEY)) {
      await exec("UPDATE products SET is_active = 0, is_featured = 0");
    }
    // Mô hình và ảnh nằm trên Supabase Storage (npm run media); không khai báo thì trỏ vào public/ của trang.
    const media = process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") ?? "";
    // Mốc thời gian cố định để thứ tự "mới nhất" của dữ liệu mẫu luôn giống nhau. Sản phẩm đã có (trùng slug)
    // được giữ nguyên; mốc này dời theo 11 sản phẩm v3 ở đầu danh sách để 28 sản phẩm v2 có cùng ngày tạo
    // như trong các CSDL đã nạp v2.
    const base = Date.UTC(2026, 8, 12);
    for (const [index, p] of SEED_PRODUCTS.entries()) {
      const createdAt = base - index * DAY_MS;
      await exec({
        sql: `INSERT INTO products (
                id, slug, name, tagline, description, category, price, compare_at_price, stock,
                model, model_url, color_primary, color_secondary, color_accent, specs, image, search_text,
                is_featured, is_active, sold, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
              ON CONFLICT (slug) DO NOTHING`,
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
          `${media}/models/${p.slug}.glb`,
          p.colors.primary,
          p.colors.secondary,
          p.colors.accent,
          JSON.stringify(p.specs),
          `${media}/products/${p.slug}.webp`,
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
