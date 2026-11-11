import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { CATEGORIES } from "@/lib/catalog";
import { foldText, slugify } from "@/lib/format";
import { hashPassword, isValidPassword } from "../auth/password";
import { newId } from "../ids";
import { DEFAULT_WAREHOUSE, movementStatements } from "../repo/inventory";
import { MIGRATIONS } from "./migrations";
import { PRODUCT_PHOTOS } from "@/data/product-photos";
import { RETIRED_SEED_SLUGS, SEED_BRANDS, SEED_PRODUCTS, SEED_SERIES } from "./seed-data";

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
  // Mở sẵn các kết nối của pool (không bắt buộc; PGlite trong test không cần).
  warm?: () => Promise<void>;
};

export type Db = {
  execute(statement: InStatement): Promise<ResultSet>;
  // Chạy cả lô trong một giao dịch: lỗi ở lệnh nào thì huỷ toàn bộ, lỗi mang theo `statementIndex`.
  batch(statements: InStatement[]): Promise<ResultSet[]>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const INIT_LOCK = 7291801;
// v4: sản phẩm có biến thể, tồn kho theo vị trí (migration 005 xoá và tạo lại bảng, nên các khoá v1 đến v3 cũ không còn ý nghĩa).
const SEED_KEY = "seed:catalog-v4";
const SEED_PRODUCT_TYPES: Record<string, string> = { "model-kits": "model_kit", "robot-hop-the": "combiner", "phu-kien": "accessory" };
// Khoá ghi theo ngày: "seed:product-photos-v2" đã bị một nhánh khác dùng trên cùng CSDL Supabase. Thêm ảnh thì đổi ngày.
const PHOTOS_SEED_KEY = "seed:product-photos-2026-11-06";
const TAXONOMY_SEED_KEY = "seed:taxonomy-v1";
const RETIRE_SEED_KEY = "seed:retire-models-v1";
const CARD_IMAGE_SEED_KEY = "seed:card-image-3d-v1";
// Link trên thanh menu đầu trang của các trang mở rộng (docs/ke-hoach/mo-rong-cua-hang.md). Mỗi link thêm đúng một lần
// (khoá seed:nav-link:<url>), nên quản trị xoá hay ẩn ở /admin/noi-dung/menu thì không bị thêm lại.
const NAV_LINKS = [
  { label: "Trưng bày", url: "/trung-bay", sortOrder: 2 },
  { label: "Gacha", url: "/gacha", sortOrder: 3 },
  { label: "Cộng đồng", url: "/cong-dong", sortOrder: 4 },
  { label: "Truyện tranh", url: "/truyen-tranh", sortOrder: 5 },
  { label: "Nhiệm vụ", url: "/nhiem-vu", sortOrder: 6 },
  { label: "Tin tức", url: "/tin-tuc", sortOrder: 7 },
  // Hàng sắp về, đặt trước (nghiep-vu-ban-hang mục 10): ngay sau Cửa hàng.
  { label: "Hàng sắp về", url: "/hang-sap-ve", sortOrder: 2 },
];

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
  // Lúc `next build` có nhiều worker cùng mở pool nên mỗi worker giữ 3 kết nối để không vượt giới hạn của máy chủ
  // CSDL. Lúc chạy thật dùng 6 (đổi qua DATABASE_POOL_MAX): lô câu đọc chạy song song (xem `batch`), mỗi kết nối
  // một câu, nên pool nhỏ bắt các câu xếp hàng chờ nhau.
  const max = process.env.NEXT_PHASE === "phase-production-build" ? 3 : Number(process.env.DATABASE_POOL_MAX) || 6;
  const pool = new Pool({
    connectionString,
    max,
    // Mặc định `pg` đóng kết nối rảnh sau 10 giây; mở lại kết nối TLS tới máy chủ ở xa mất gần 1 giây,
    // nên người dùng thao tác thưa sẽ luôn gặp độ trễ đó. Giữ kết nối rảnh 5 phút.
    idleTimeoutMillis: 5 * 60 * 1000,
    ssl: isLocal ? false : caFile ? { ca: readFileSync(caFile, "utf8") } : true,
  });
  // Kết nối rảnh bị máy chủ ngắt sẽ phát sự kiện lỗi; không bắt thì tiến trình Node dừng hẳn.
  pool.on("error", (error) => console.error("[robotica] Lỗi kết nối CSDL:", error.message));

  return {
    query: (text, values) => pool.query(text, values),
    // Mở mọi kết nối của pool cùng lúc. Mỗi kết nối mới tới Supabase tốn ~0,6 s bắt tay TLS; mở song song lúc khởi
    // động thì cả pool chỉ tốn bằng một kết nối, và các lô câu đọc song song về sau không phải chờ mở kết nối.
    // Chỉ cần một kết nối mở được là đủ chạy; lỗi hết mới báo.
    async warm() {
      const results = await Promise.allSettled(Array.from({ length: max }, () => pool.connect()));
      for (const result of results) if (result.status === "fulfilled") result.value.release();
      if (results.every((result) => result.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
    },
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

// Câu chỉ đọc: bắt đầu bằng SELECT/WITH, không ghi, không khoá. Từ khoá lạ trong chuỗi (ví dụ 'product.delete')
// chỉ làm lô chạy trong giao dịch như cũ, không sai.
const READS = /^\s*(SELECT|WITH)\b/i;
const NEEDS_TRANSACTION = /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|LOCK|FOR\s+(NO\s+KEY\s+)?UPDATE|FOR\s+(KEY\s+)?SHARE|pg_advisory\w*|set_config|nextval|setval)\b/i;

export function isReadOnly(statement: InStatement): boolean {
  const sql = typeof statement === "string" ? statement : statement.sql;
  return READS.test(sql) && !NEEDS_TRANSACTION.test(sql);
}

function tagStatement(error: unknown, index: number): never {
  if (error instanceof Error) (error as Error & { statementIndex?: number }).statementIndex = index;
  throw error;
}

function wrap(backend: Backend): Db {
  return {
    execute: (statement) => run(backend.query, statement),
    // Lô toàn câu đọc chạy song song, ngoài giao dịch. PostgreSQL mặc định READ COMMITTED: trong giao dịch mỗi câu
    // vẫn lấy ảnh dữ liệu riêng, nên bọc giao dịch không làm kết quả nhất quán hơn, chỉ thêm hai lượt BEGIN/COMMIT
    // và bắt các câu chạy nối tiếp. CSDL ở xa (Supabase Seoul, ~100 ms mỗi lượt đi về) nên lô 6 câu từ 800 ms còn
    // khoảng 100 ms. Lô có ghi hoặc khoá vẫn chạy trong một giao dịch như trước.
    batch: (statements) =>
      statements.every(isReadOnly)
        ? Promise.all(statements.map((statement, index) => run(backend.query, statement).catch((error) => tagStatement(error, index))))
        : backend.transaction(async (query) => {
            const results: ResultSet[] = [];
            for (const [index, statement] of statements.entries()) {
              results.push(await run(query, statement).catch((error) => tagStatement(error, index)));
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
// Mọi khoá trong bảng `meta` mà migrateAndSeed kiểm tra. Thêm bước khởi tạo mới thì thêm khoá của nó vào đây
// (test/db-init.test.ts so danh sách này với các khoá thật sự được ghi trên CSDL mới).
export function initKeys(): string[] {
  return [
    ...MIGRATIONS.map((migration) => `migration:${migration.id}`),
    TAXONOMY_SEED_KEY,
    SEED_KEY,
    PHOTOS_SEED_KEY,
    RETIRE_SEED_KEY,
    CARD_IMAGE_SEED_KEY,
    ...NAV_LINKS.map((link) => `seed:nav-link:${link.url}`),
  ];
}

async function migrateAndSeed(backend: Backend) {
  // Đường nhanh: CSDL đã khởi tạo đủ thì chỉ đọc `meta` một lần (một lượt đi về), không mở giao dịch, không giữ khoá.
  // Đường đầy đủ bên dưới tốn sáu lượt (~600 ms tới Supabase) ở yêu cầu đầu tiên của mỗi tiến trình, tức mỗi lần máy
  // chủ khởi động lại hay hàm serverless khởi động lạnh. Bảng `meta` chưa có thì truy vấn lỗi và đi đường đầy đủ.
  const existing = await backend.query("SELECT key FROM meta").catch(() => null);
  if (existing) {
    const have = new Set(existing.rows.map((row) => String(row.key)));
    if (initKeys().every((key) => have.has(key))) return;
  }
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

    if (!done.has(SEED_KEY)) await seedCatalog(exec);
    if (!done.has(PHOTOS_SEED_KEY)) {
      await seedProductPhotos(exec);
      await mark(PHOTOS_SEED_KEY);
    }
    if (!done.has(RETIRE_SEED_KEY)) {
      await retireSeedProducts(exec);
      await mark(RETIRE_SEED_KEY);
    }
    if (!done.has(CARD_IMAGE_SEED_KEY)) {
      await restoreModelCardImages(exec);
      await mark(CARD_IMAGE_SEED_KEY);
    }
    for (const link of NAV_LINKS) {
      const key = `seed:nav-link:${link.url}`;
      if (done.has(key)) continue;
      await exec({
        sql: `INSERT INTO nav_items (id, menu, label, url, sort_order, is_active)
              SELECT ?, 'header', ?, ?, ?, true WHERE NOT EXISTS (SELECT 1 FROM nav_items WHERE menu = 'header' AND url = ?)`,
        args: [newId(), link.label, link.url, link.sortOrder, link.url],
      });
      await mark(key);
    }
  });
}

// Ẩn các mẫu không đạt chuẩn mô hình 3D (RETIRED_SEED_SLUGS). Chỉ đổi trạng thái, giữ bản ghi, biến thể và sổ kho
// để đơn hàng cũ và đối soát kho vẫn khớp.
export async function retireSeedProducts(exec: (statement: InStatement) => Promise<ResultSet>) {
  await exec({
    sql: `UPDATE products SET status = 'archived', is_featured = false WHERE slug IN (${RETIRED_SEED_SLUGS.map(() => "?").join(", ")}) AND status <> 'archived'`,
    args: RETIRED_SEED_SLUGS,
  });
}

// Bản đầu (seed:product-photos-v1) đã đặt ảnh thật đầu tiên làm ảnh đại diện. Trả các sản phẩm đó về ảnh dựng 3D,
// chỉ khi ảnh đại diện vẫn là một ảnh thật của dữ liệu mẫu (ảnh do quản trị tự đổi thì giữ).
export async function restoreModelCardImages(exec: (statement: InStatement) => Promise<ResultSet>) {
  const media = process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  for (const [slug, set] of Object.entries(PRODUCT_PHOTOS)) {
    await exec({
      sql: `UPDATE products SET image = ? WHERE slug = ? AND image IN (${set.urls.map(() => "?").join(", ")})`,
      args: [`${media}/products/${slug}.webp`, slug, ...set.urls],
    });
  }
}

// Ảnh thật của dữ liệu mẫu (src/data/product-photos.ts). Chạy cả trên CSDL đã có dữ liệu từ trước; sản phẩm đã có
// ảnh trong product_media (do quản trị tải lên) thì giữ nguyên. Ảnh thật chỉ vào thư viện ảnh (trang chi tiết); ảnh
// đại diện trên thẻ sản phẩm, giỏ hàng, menu vẫn là ảnh dựng từ mô hình 3D để mọi sản phẩm cùng một kiểu.
async function seedProductPhotos(exec: (statement: InStatement) => Promise<ResultSet>) {
  const now = Date.UTC(2026, 10, 4);
  for (const [slug, set] of Object.entries(PRODUCT_PHOTOS)) {
    const found = await exec({
      sql: "SELECT id FROM products WHERE slug = ? AND NOT EXISTS (SELECT 1 FROM product_media m WHERE m.product_id = products.id AND m.kind = 'image')",
      args: [slug],
    });
    const productId = found.rows[0]?.id;
    if (!productId) continue;
    for (const [index, url] of set.urls.entries()) {
      await exec({
        sql: "INSERT INTO product_media (id, product_id, kind, url, alt, sort_order, created_at) VALUES (?, ?, 'image', ?, ?, ?, ?)",
        args: [newId(), String(productId), url, `Ảnh sản phẩm thật ${index + 1}`, index, now],
      });
    }
    if (set.box) {
      await exec({ sql: "UPDATE products SET box_contents = ? WHERE id = ? AND box_contents = ''", args: [set.box.join("\n"), String(productId)] });
    }
  }
}

async function seedCatalog(exec: (statement: InStatement) => Promise<ResultSet>) {
    // Mô hình và ảnh nằm trên Supabase Storage (npm run media); không khai báo thì trỏ vào public/ của trang.
    const media = process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") ?? "";
    // Mốc thời gian cố định để thứ tự "mới nhất" của dữ liệu mẫu luôn giống nhau.
    const base = Date.UTC(2026, 8, 12);
    // Tồn ban đầu đi qua một phiếu nhập đã ghi sổ (PN-SEED) để sổ kho và số dư khớp nhau ngay từ đầu.
    const documentId = newId();
    await exec({
      sql: `INSERT INTO stock_documents (id, code, type, status, warehouse_id, reason_code, note, posted_at, created_at, updated_at)
            VALUES (?, 'PN-SEED', 'receipt', 'posted', ${DEFAULT_WAREHOUSE}, 'purchase', 'Tồn ban đầu của dữ liệu mẫu', ?, ?, ?)`,
      args: [documentId, base, base, base],
    });
    const locationId = String((await exec("SELECT id FROM locations WHERE code = 'A-01'")).rows[0].id);
    for (const [index, p] of SEED_PRODUCTS.entries()) {
      const createdAt = base - index * DAY_MS;
      const spec = (...labels: string[]) => p.specs.find((s) => labels.includes(s.label))?.value;
      const productId = newId();
      const variantId = newId();
      await exec({
        sql: `INSERT INTO products (
                id, slug, name, tagline, description, category_id, brand_id, series_id, product_type,
                model, model_url, specs, image, search_text, is_featured, status, published_at, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, (SELECT id FROM categories WHERE slug = ?), (SELECT id FROM brands WHERE slug = ?),
                        (SELECT id FROM series WHERE slug = ?), ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`,
        args: [
          productId,
          p.slug,
          p.name,
          p.tagline,
          p.description,
          p.category,
          slugify(spec("Hãng sản xuất")?.split(", ")[0] ?? ""),
          slugify(spec("Dòng phim", "Dòng") ?? ""),
          SEED_PRODUCT_TYPES[p.category] ?? "figure",
          p.model,
          `${media}/models/${p.slug}.glb`,
          JSON.stringify(p.specs),
          `${media}/products/${p.slug}.webp`,
          foldText(`${p.name} ${p.tagline} ${p.description}`),
          p.featured,
          createdAt,
          createdAt,
          createdAt,
        ],
      });
      await exec({
        sql: `INSERT INTO product_variants (
                id, product_id, sku, name, price, compare_at_price, color_primary, color_secondary, color_accent,
                is_default, created_at, updated_at
              ) VALUES (?, ?, ?, 'Bản thường', ?, ?, ?, ?, ?, true, ?, ?)`,
        args: [variantId, productId, `RB-${p.slug.toUpperCase()}`, p.price, p.compareAtPrice, p.colors.primary, p.colors.secondary, p.colors.accent, createdAt, createdAt],
      });
      if (p.stock <= 0) continue;
      // Giá vốn mẫu: 60% giá bán (số tự đặt cho dữ liệu minh hoạ).
      const unitCost = Math.round(p.price * 0.6);
      await exec({
        sql: `INSERT INTO stock_document_lines (document_id, variant_id, location_id, qty_expected, qty, qty_quarantined, unit_cost)
              VALUES (?, ?, ?, ?, ?, 0, ?)`,
        args: [documentId, variantId, locationId, p.stock, p.stock, unitCost],
      });
      for (const statement of movementStatements({
        variantId,
        locationId,
        type: "receive",
        qtyDelta: p.stock,
        unitCost,
        documentId,
        reason: "purchase",
        now: base,
      })) {
        await exec(statement);
      }
      await exec({
        sql: `UPDATE inventory SET avg_cost = ?, last_received_at = ? WHERE variant_id = ?`,
        args: [unitCost, base, variantId],
      });
    }
    await exec({ sql: "INSERT INTO meta (key, value) VALUES (?, ?)", args: [SEED_KEY, new Date().toISOString()] });
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
  await backend.warm?.();
  await migrateAndSeed(backend);
  const db = wrap(backend);
  await ensureAdmin(db);
  // Dọn phiên và giới hạn tốc độ đã hết hạn trong một câu lệnh (CTE xoá hai bảng): một lượt đi về.
  await db.execute({
    sql: "WITH expired AS (DELETE FROM sessions WHERE expires_at < ?) DELETE FROM rate_limits WHERE reset_at < ?",
    args: [Date.now(), Date.now()],
  });
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
