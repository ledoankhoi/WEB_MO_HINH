// Sinh dữ liệu mẫu (khách, nhập kho, đơn hàng, đánh giá, cộng đồng, tin tức) vào CSDL DATABASE_URL: scripts/demo/seed-demo.ts.
// Chạy một lần; lần hai bị chặn. Nên `npm run backup` trước. Biến tuỳ chọn: DEMO_DAYS (180), DEMO_SCALE (1),
// DEMO_DRY=1 để chạy thử trên PGlite. Chạy: npm run demo-data
import { spawnSync } from "node:child_process";

if (process.env.DEMO_DRY !== "1" && !process.env.DATABASE_URL?.trim()) {
  console.error("Thiếu DATABASE_URL trong .env.local");
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "scripts/demo/vitest.config.ts", "--silent=false", "--reporter=dot"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
