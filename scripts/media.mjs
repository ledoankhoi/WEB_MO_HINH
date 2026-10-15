// Nén mô hình trong data/models-raw/ rồi tải mô hình và ảnh sản phẩm lên Supabase Storage (bucket công khai "media").
//   data/models-raw/<slug>.glb  --nén-->  data/models/<slug>.glb  --tải lên-->  media/models/<slug>.glb
//   data/products/<slug>.webp                                      --tải lên-->  media/products/<slug>.webp
// Ảnh sản phẩm là ảnh chụp mô hình bằng PosterCanvas (src/components/three/PosterCanvas.tsx).
//
// Cần SUPABASE_URL và SUPABASE_SECRET_KEY trong .env.local. Chạy: npm run media
// Sau đó đặt MEDIA_BASE_URL=<SUPABASE_URL>/storage/v1/object/public/media để dữ liệu mẫu trỏ tới đây.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const BUCKET = "media";
// Tên file không đổi khi nội dung đổi, nên chỉ cho trình duyệt giữ 1 ngày; CDN vẫn phục vụ phần lớn lượt tải.
const CACHE_SECONDS = 86400;

const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY trong .env.local");
  process.exit(1);
}
// Khoá mới (sb_secret_...) chỉ gửi qua apikey; khoá service_role kiểu cũ (JWT) cần thêm Authorization.
const auth = key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };

const root = path.resolve(import.meta.dirname, "..");
const dir = (name) => path.join(root, "data", name);
const cli = path.join(root, "node_modules/@gltf-transform/cli/bin/cli.js");

// 1. Nén: lưới bằng meshopt (khung xem 3D đã bật bộ giải nén), texture sang WebP tối đa 1024 px.
mkdirSync(dir("models"), { recursive: true });
for (const file of readdirSync(dir("models-raw")).filter((f) => f.endsWith(".glb"))) {
  const input = path.join(dir("models-raw"), file);
  const output = path.join(dir("models"), file);
  if (existsSync(output) && statSync(output).mtimeMs > statSync(input).mtimeMs) continue;
  execFileSync(process.execPath, [cli, "optimize", input, output, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024"], { stdio: "ignore" });
  console.log(`nén ${file}: ${(statSync(input).size / 1e6).toFixed(1)} → ${(statSync(output).size / 1e6).toFixed(2)} MB`);
}

// 2. Tạo bucket công khai nếu chưa có.
const created = await fetch(`${url}/storage/v1/bucket`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
});
if (!created.ok && !/already exists|Duplicate/i.test(await created.text())) {
  throw new Error(`Không tạo được bucket: HTTP ${created.status}`);
}

// 3. Tải lên, ghi đè file cũ cùng tên.
const uploads = [
  ...readdirSync(dir("models")).filter((f) => f.endsWith(".glb")).map((f) => ["models", f, "model/gltf-binary"]),
  ...readdirSync(dir("products")).filter((f) => f.endsWith(".webp")).map((f) => ["products", f, "image/webp"]),
];
let failed = 0;
for (const [folder, file, contentType] of uploads) {
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${folder}/${file}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": contentType, "x-upsert": "true", "Cache-Control": `max-age=${CACHE_SECONDS}` },
    body: readFileSync(path.join(dir(folder), file)),
  });
  if (!response.ok) {
    failed++;
    console.error(`✗ ${folder}/${file}: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  }
}
console.log(`\nĐã tải lên ${uploads.length - failed}/${uploads.length} file vào ${url}/storage/v1/object/public/${BUCKET}/`);
if (failed) process.exit(1);
