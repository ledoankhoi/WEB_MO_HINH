// Tải các phần model.partNN.onnx của một gói B9 lên Supabase Storage (bucket công khai media, thư mục ml/<mã mô hình>/), rồi kiểm tra
// kích thước từ địa chỉ công khai. Cần SUPABASE_URL, SUPABASE_SECRET_KEY. Sau đó nhập bằng scripts/recognition-import.mjs.
// Chạy: node --env-file-if-exists=.env.local scripts/recognition-upload.mjs <thư mục goi/>
import { readFileSync } from "node:fs";
import path from "node:path";
const dir = process.argv[2];
const card = JSON.parse(readFileSync(path.join(dir, "model-card.json"), "utf8"));
const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !key) { console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY"); process.exit(1); }
const auth = key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
let failed = 0;
for (const part of card.files) {
  const body = readFileSync(path.join(dir, part.name));
  const res = await fetch(`${url}/storage/v1/object/media/ml/${card.id}/${part.name}`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/octet-stream", "x-upsert": "true", "Cache-Control": "max-age=31536000" }, body,
  });
  if (!res.ok) { failed++; console.error(`✗ ${part.name}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`); }
  else console.log(`✓ ${part.name} (${(body.length / 1048576).toFixed(1)} MB)`);
}
// Kiểm tra lại từ địa chỉ công khai: kích thước khớp
for (const part of card.files) {
  const res = await fetch(`${url}/storage/v1/object/public/media/ml/${card.id}/${part.name}`, { method: "HEAD" });
  console.log(`${part.name}: HTTP ${res.status}, ${res.headers.get("content-length")} byte (cần ${part.bytes})`);
}
process.exit(failed ? 1 : 0);
