// Nhập robots.json và một gói mô hình B9 vào CSDL DATABASE_URL (scripts/recognition/import.run.ts), giống trang /admin/nhan-dien.
// Chạy: node --env-file-if-exists=.env.local scripts/recognition-import.mjs <thư mục goi/> [--activate]
//       node --env-file-if-exists=.env.local scripts/recognition-import.mjs --delete <mã mô hình>   (xoá mô hình không còn bật)
// Script chạy ngoài Next.js nên không gọi updateTag: máy chủ đang chạy vẫn giữ mô hình cũ trong cache ("use cache", vài giờ) tới khi
// khởi động lại. Trên bản thật, sau khi nhập thì bấm bật lại ở /admin/nhan-dien để làm mới ngay.
import { spawnSync } from "node:child_process";
import path from "node:path";

const [dir, flag] = process.argv.slice(2);
const remove = dir === "--delete" ? flag : "";
if (!dir || (dir === "--delete" && !flag) || !process.env.DATABASE_URL?.trim()) {
  console.error("Cách dùng: node --env-file-if-exists=.env.local scripts/recognition-import.mjs <thư mục goi/> [--activate] (cần DATABASE_URL, MEDIA_BASE_URL)");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "scripts/recognition/vitest.config.ts", "--silent=false", "--reporter=dot"], {
  stdio: "inherit",
  env: { ...process.env, RECOGNITION_PACKAGE: remove ? "" : path.resolve(dir), RECOGNITION_ACTIVATE: flag === "--activate" ? "1" : "", RECOGNITION_DELETE: remove },
});
process.exit(result.status ?? 1);
