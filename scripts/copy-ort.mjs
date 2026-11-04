// Chép thư viện ONNX Runtime Web (bản WASM chạy trên CPU) vào public/image-search/ort/ để worker tìm kiếm
// bằng ảnh nạp trực tiếp, không qua bundler và không phụ thuộc CDN. Thư mục đích nằm trong .gitignore;
// script chạy sau `npm install` (postinstall) và trước `dev`, `build`.
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

const source = path.join(process.cwd(), "node_modules/onnxruntime-web/dist");
const target = path.join(process.cwd(), "public/image-search/ort");
// ort.wasm.bundle.min.mjs đã gộp sẵn phần JS nối với WebAssembly, chỉ cần thêm đúng một file .wasm.
const FILES = ["ort.wasm.bundle.min.mjs", "ort-wasm-simd-threaded.wasm"];

if (!existsSync(source)) {
  console.warn("[copy-ort] Chưa cài onnxruntime-web, bỏ qua.");
  process.exit(0);
}
mkdirSync(target, { recursive: true });
for (const file of FILES) {
  const from = path.join(source, file);
  const to = path.join(target, file);
  if (existsSync(to) && statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
  copyFileSync(from, to);
}
console.log(`[copy-ort] ONNX Runtime Web → public/image-search/ort (${FILES.length} file)`);
