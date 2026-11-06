// Kiểm tra chuẩn tương tác của mô hình 3D: đọc clip hoạt ảnh trong từng file .glb, đối chiếu với khai báo ở
// src/lib/model-features.ts và danh mục mẫu. Chỉ đọc, không ghi gì.
//   npm run models:audit                 đọc data/models/*.glb (bản nén do `npm run media` tạo)
//   npm run models:audit -- --remote     tải từng file từ MEDIA_BASE_URL (mặc định kho Supabase của dự án)
//   npm run models:audit -- --dir <thư mục>
// Chuẩn (docs/chuan/09-mo-hinh-3d.md mục 4.4): robot phải có clip biến hình/hợp thể hoặc từ 2 dáng có sẵn;
// phụ kiện được miễn. Mã thoát 1 nếu có file lỗi hoặc khai báo trỏ tới clip không tồn tại.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dirIndex = args.indexOf("--dir");
const dir = path.resolve(dirIndex >= 0 ? args[dirIndex + 1] : path.join(root, "data/models"));
const media =
  process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") ||
  "https://wfharbhshdccjkblpraw.supabase.co/storage/v1/object/public/media";

// Node 22.18+ bỏ kiểu của file .ts khi nạp; hai file này chỉ có `import type`.
const { MODEL_FEATURES } = await import(pathToFileURL(path.join(root, "src/lib/model-features.ts")).href);
const { SEED_PRODUCTS } = await import(pathToFileURL(path.join(root, "src/server/db/seed-data.ts")).href);

// Phần JSON đầu file .glb: 12 byte tiêu đề, rồi đoạn đầu tiên (độ dài, kiểu, dữ liệu).
function readGltf(buffer) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error("không phải file .glb");
  const length = buffer.readUInt32LE(12);
  return JSON.parse(buffer.toString("utf8", 20, 20 + length));
}

async function load(slug) {
  if (remote) {
    const response = await fetch(`${media}/models/${slug}.glb`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const file = path.join(dir, `${slug}.glb`);
  if (!existsSync(file)) throw new Error(`thiếu file ${path.relative(root, file)}`);
  return readFileSync(file);
}

// Sản phẩm mẫu, cộng các mô hình khai báo trong MODEL_FEATURES mà chỉ có trên CSDL thật (thêm qua trang quản trị):
// những mô hình đó vẫn được đọc file và đối chiếu clip như sản phẩm mẫu.
const targets = SEED_PRODUCTS.map((product) => ({ slug: product.slug, accessory: product.category === "phu-kien", seeded: true }));
for (const slug of Object.keys(MODEL_FEATURES)) {
  if (!targets.some((target) => target.slug === slug)) targets.push({ slug, accessory: false, seeded: false });
}

const rows = [];
for (const product of targets) {
  const features = MODEL_FEATURES[product.slug];
  const row = { slug: product.slug, accessory: product.accessory, seeded: product.seeded, clips: [], transform: false, poses: 0, problems: [] };
  try {
    const gltf = readGltf(await load(product.slug));
    row.clips = (gltf.animations ?? []).map((a) => a.name);
    // Clip biến hình khai báo mà file không có là lỗi. Dáng thiếu clip thì viewer tự bỏ (xem `alliance()` trong
    // model-features.ts), nên chỉ đếm các dáng có clip thật.
    if (features?.transform && !row.clips.includes(features.transform.clip)) {
      row.problems.push(`clip biến hình "${features.transform.clip}" không có trong file`);
    }
    row.transform = Boolean(features?.transform);
    row.poses = (features?.poses ?? []).filter((pose) => row.clips.includes(pose.clip)).length;
  } catch (error) {
    row.problems.push(error.message);
  }
  if (!row.accessory && !row.transform && row.poses < 2) row.problems.push("thiếu biến hình/hợp thể và dáng");
  rows.push(row);
}

const bad = rows.filter((row) => row.problems.length);
for (const row of rows) {
  const mark = row.problems.length ? "THIẾU" : "đạt  ";
  const info = row.accessory ? "phụ kiện" : `biến hình: ${row.transform ? "có" : "không"}, dáng: ${row.poses}, clip trong file: ${row.clips.length}`;
  console.log(`${mark}  ${row.slug.padEnd(28)} ${info}${row.seeded ? "" : "  (ngoài dữ liệu mẫu)"}${row.problems.length ? `  <- ${row.problems.join("; ")}` : ""}`);
}
console.log(`\n${rows.length - bad.length}/${rows.length} đạt chuẩn, ${bad.length} chưa đạt.`);
process.exitCode = bad.length ? 1 : 0;
