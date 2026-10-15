// Tải mô hình 3D (.glb) gốc từ Sketchfab theo danh sách trong scripts/sketchfab-models.json vào data/models-raw/
// (ngoài git), đồng thời ghi tác giả và giấy phép của từng mô hình vào src/data/model-credits.json.
// Bước tiếp theo: `npm run media` để nén và tải lên Supabase Storage.
//
// Cần SKETCHFAB_API_TOKEN trong .env.local (lấy ở https://sketchfab.com/settings/password).
// Chạy: npm run models   (bỏ qua file đã có; thêm --force để tải lại)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API = "https://api.sketchfab.com/v3";
const token = process.env.SKETCHFAB_API_TOKEN?.trim();
if (!token) {
  console.error("Thiếu SKETCHFAB_API_TOKEN trong .env.local");
  process.exit(1);
}
const force = process.argv.includes("--force");
const root = path.resolve(import.meta.dirname, "..");
const rawDir = path.join(root, "data/models-raw");
mkdirSync(rawDir, { recursive: true });

const list = JSON.parse(readFileSync(path.join(import.meta.dirname, "sketchfab-models.json"), "utf8"));
const creditsFile = path.join(root, "src/data/model-credits.json");
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, "utf8")) : {};

async function getJson(url, auth = false) {
  const response = await fetch(url, auth ? { headers: { Authorization: `Token ${token}` } } : undefined);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

let failed = 0;
for (const { uid, slug } of list) {
  const modelFile = path.join(rawDir, `${slug}.glb`);
  try {
    const info = await getJson(`${API}/models/${uid}`);
    credits[slug] = {
      title: info.name,
      author: info.user?.displayName || info.user?.username,
      authorUrl: info.user?.profileUrl,
      license: info.license?.label,
      licenseUrl: info.license?.url,
      sourceUrl: info.viewerUrl,
    };

    if (force || !existsSync(modelFile)) {
      const links = await getJson(`${API}/models/${uid}/download`, true);
      if (!links.glb?.url) throw new Error("mô hình không có bản .glb");
      const response = await fetch(links.glb.url);
      if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${slug}.glb`);
      const bytes = Buffer.from(await response.arrayBuffer());
      writeFileSync(modelFile, bytes);
      console.log(`✓ ${slug}  ${(bytes.length / 1e6).toFixed(1)} MB  ${credits[slug].license}`);
    } else {
      console.log(`- ${slug}  đã có, bỏ qua`);
    }
  } catch (error) {
    failed++;
    console.error(`✗ ${slug}: ${error.message}`);
  }
}

writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + "\n");
console.log(`\nXong: ${list.length - failed}/${list.length} mô hình trong data/models-raw/.`);
if (failed) process.exit(1);
