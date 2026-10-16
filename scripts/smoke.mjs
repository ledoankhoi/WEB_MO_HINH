// Kiểm tra nhanh mọi trang: bật `next dev` ở cổng 3100, mở từng trang trong PAGES với phiên quản trị,
// báo lỗi nếu mã trả về khác mong đợi hoặc HTML có dấu hiệu lỗi. Chạy: npm run smoke
// Cần DATABASE_URL và ADMIN_EMAIL trong .env.local (tài khoản quản trị đã được tạo ở lần chạy trước).
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import pg from "pg";

// Danh sách trang. `status` mặc định 200; trang chuyển hướng ghi mã mong đợi (Next.js dùng 307).
// Trang /admin mở qua tên miền quản trị (src/proxy.ts); `host` ghi đè để kiểm tra hai tên miền chặn lẫn nhau.
// Đường dẫn có :product, :productId, :order, :orderToken, :categoryId được thay bằng dữ liệu thật trong CSDL.
const PAGES = [
  { path: "/" },
  { path: "/san-pham" },
  { path: "/san-pham/:product" },
  { path: "/gio-hang" },
  { path: "/thanh-toan" },
  { path: "/dang-nhap" },
  { path: "/dang-ky" },
  { path: "/tra-cuu-don-hang" },
  { path: "/tai-khoan", status: 307 },
  { path: "/don-hang/:orderToken" },
  { path: "/admin" },
  { path: "/admin/san-pham" },
  { path: "/admin/san-pham/moi" },
  { path: "/admin/san-pham/:productId" },
  { path: "/admin/san-pham/:productId?tab=bien-the" },
  { path: "/admin/san-pham/:productId?tab=media" },
  { path: "/admin/san-pham/:productId?tab=xem-truoc" },
  { path: "/admin/san-pham?trang-thai=published&q=gundam" },
  { path: "/admin/danh-muc" },
  { path: "/admin/danh-muc?sua=:categoryId" },
  { path: "/admin/thuong-hieu" },
  { path: "/admin/series" },
  { path: "/admin/noi-dung/banner" },
  { path: "/admin/noi-dung/menu" },
  { path: "/admin/noi-dung/cai-dat" },
  { path: "/admin/don-hang" },
  { path: "/admin/don-hang/:order" },
  { path: "/admin/don-hang?van-chuyen=not_created&thanh-toan=unpaid&q=RB" },
  { path: "/admin/don-hang/cho-hoan-tien" },
  { path: "/admin/kho/lay-hang" },
  { path: "/admin/kho" },
  { path: "/admin/kho?loc=low&q=RB" },
  { path: "/admin/kho/the-kho/:variantId" },
  { path: "/admin/kho/doi-soat" },
  { path: "/admin/xuat/ton-kho" },
  { path: "/admin/kho/phieu" },
  { path: "/admin/kho/phieu?loai=receipt&trang-thai=posted" },
  { path: "/admin/kho/phieu/:documentId" },
  { path: "/admin/kho/cach-ly" },
  { path: "/admin/kho/vi-tri" },
  { path: "/admin/nha-cung-cap" },
  { path: "/admin/khach-hang" },
  { path: "/admin/nhan-vien" },
  { path: "/admin/nhat-ky" },
  { path: "/admin/nhat-ky?hanh-dong=auth.admin_login&tu=2026-01-01&den=2026-12-31" },
  { path: "/admin/dang-nhap", status: 307 },
  { path: "/admin", host: "store", status: 404 },
  { path: "/", host: "admin", status: 307 },
  { path: "/san-pham", host: "admin", status: 404 },
];

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
// Node không tự trỏ admin.localhost về máy này như trình duyệt, nên gửi tới localhost kèm header Host
// (fetch bỏ qua header Host, nên dùng node:http).
const ADMIN_HOST = `${process.env.ADMIN_HOST?.trim() || "admin.localhost"}:${PORT}`;
// Trang lỗi của Next.js và trang lỗi riêng của dự án (src/app/error.tsx).
const ERROR_MARKERS = [/id="__next_error__"/, /Đã có lỗi xảy ra/, /Unhandled Runtime Error/, /Internal Server Error/];

const root = path.resolve(import.meta.dirname, "..");
const connectionString = process.env.DATABASE_URL?.trim();
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!connectionString || !adminEmail) {
  console.error("Thiếu DATABASE_URL hoặc ADMIN_EMAIL trong .env.local");
  process.exit(1);
}

// Cùng cách kết nối TLS với src/server/db/index.ts.
const { hostname } = new URL(connectionString);
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const caFile =
  process.env.DATABASE_CA_CERT?.trim() ||
  (/\.supabase\.(com|co)$/.test(hostname) ? path.join(root, "certs/supabase-ca.crt") : "");
const pool = new pg.Pool({
  connectionString,
  max: 1,
  ssl: isLocal ? false : caFile ? { ca: readFileSync(caFile, "utf8") } : true,
});

const one = async (sql, args = []) => (await pool.query(sql, args)).rows[0];

const server = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "-p", String(PORT)], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: ".next-smoke" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

function stopServer() {
  if (server.exitCode !== null) return;
  // next dev sinh tiến trình con; trên Windows phải tắt cả cây, không thì cổng vẫn bị giữ.
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
  } else server.kill("SIGTERM");
}

let sessionId = null;
const failures = [];

try {
  const admin = await one("SELECT id FROM users WHERE email = $1 AND role = 'admin'", [adminEmail]);
  if (!admin) throw new Error(`Không có tài khoản quản trị ${adminEmail}; chạy npm run dev một lần để tạo.`);

  // Phiên giống src/server/auth/session.ts: cookie mang token, CSDL lưu SHA-256 của token.
  const token = randomBytes(32).toString("base64url");
  sessionId = createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)", [
    sessionId,
    admin.id,
    Date.now() + 60 * 60 * 1000,
    Date.now(),
  ]);

  // Chờ máy chủ trả lời (lần đầu biên dịch có thể lâu).
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`next dev dừng sớm:\n${serverLog}`);
    if (Date.now() > deadline) throw new Error("next dev không trả lời sau 120 giây");
    const ok = await fetch(`${BASE}/`, { redirect: "manual" }).then(
      () => true,
      () => false,
    );
    if (ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Đọc sau khi máy chủ đã trả lời: lần gọi đầu tiên chạy migration (bảng mới như categories).
  const product = await one("SELECT id, slug FROM products ORDER BY created_at DESC LIMIT 1");
  const order = await one("SELECT id, token FROM orders ORDER BY created_at DESC LIMIT 1");
  const category = await one("SELECT id FROM categories ORDER BY sort_order LIMIT 1");
  const document = await one("SELECT id FROM stock_documents ORDER BY created_at DESC LIMIT 1");
  const variant = await one("SELECT variant_id FROM stock_movements ORDER BY id LIMIT 1");
  const params = { product: product?.slug, productId: product?.id, order: order?.id, orderToken: order?.token, categoryId: category?.id, documentId: document?.id, variantId: variant?.variant_id };

  for (const page of PAGES) {
    const missing = page.path.match(/:(\w+)/g)?.find((key) => !params[key.slice(1)]);
    if (missing) {
      console.log(`bỏ qua ${page.path}: CSDL chưa có dữ liệu cho ${missing}`);
      continue;
    }
    const url = page.path.replace(/:(\w+)/g, (_, key) => encodeURIComponent(params[key]));
    const expected = page.status ?? 200;
    const started = Date.now();
    try {
      const response = await get(`${BASE}${url}`, {
        headers: { cookie: `rs_admin=${token}`, ...((page.host ?? (url.startsWith("/admin") ? "admin" : "store")) === "admin" && { host: ADMIN_HOST }) },
      });
      const html = response.text;
      // redirect() trong <Suspense> chạy sau khi mã 200 đã gửi; Next.js chuyển hướng bằng thẻ meta refresh.
      const status = response.status === 200 && /id="__next-page-redirect"/.test(html) ? 307 : response.status;
      const marker = ERROR_MARKERS.find((pattern) => pattern.test(html));
      const problem = status !== expected ? `mã ${status}, mong đợi ${expected}` : marker ? `HTML có dấu hiệu lỗi ${marker}` : null;
      if (problem) failures.push(`${url}: ${problem}`);
      console.log(`${problem ? "LỖI" : "ok "} ${status} ${page.host ? `[${page.host}] ` : ""}${url} (${Date.now() - started} ms)${problem ? ` — ${problem}` : ""}`);
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
      console.log(`LỖI ${url} — ${error.message}`);
    }
  }
} catch (error) {
  failures.push(error.message);
  console.error(error.message);
} finally {
  if (sessionId) await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]).catch(() => {});
  await pool.end();
  stopServer();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} trang lỗi:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nMọi trang đều ổn.");

function get(url, { headers }) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => (text += chunk));
      response.on("end", () => resolve({ status: response.statusCode, text }));
    });
    request.on("error", reject);
  });
}
