import { afterAll, it, vi } from "vitest";
import { setupTempDatabase } from "../../test/helpers/temp-db";

// Chạy bộ sinh dữ liệu mẫu (seed-demo.ts) qua Vitest để dùng được mã của cửa hàng (alias @/, server-only) và đồng hồ giả.
// Gọi bằng scripts/demo-data.mjs. DEMO_DRY=1: chạy trên PGlite (không đụng CSDL thật) để xem trước số liệu.
const dry = process.env.DEMO_DRY === "1";
const cleanup = dry ? setupTempDatabase() : null;
const { getDb } = await import("@/server/db");
const { seedDemo } = await import("./seed-demo");
afterAll(async () => {
  vi.useRealTimers();
  await cleanup?.();
});

it("sinh dữ liệu mẫu", async () => {
  const db = await getDb();
  // Mốc "bây giờ" lấy theo đồng hồ CSDL; mọi việc của dữ liệu mẫu xảy ra trước mốc này.
  const now = Number((await db.execute("SELECT (extract(epoch FROM now()) * 1000)::bigint AS now")).rows[0].now);
  const days = Number(process.env.DEMO_DAYS || 180);
  const scale = Number(process.env.DEMO_SCALE || 1);
  console.log(`${dry ? "[THỬ, PGlite] " : ""}Sinh dữ liệu mẫu ${days} ngày, quy mô ${scale}...`);
  vi.useFakeTimers({ toFake: ["Date"] });
  const started = performance.now();
  const resume = process.env.DEMO_RESUME === "1";
  const summary = await seedDemo({ now, days, scale, resume, setClock: (ms) => vi.setSystemTime(ms), log: (message) => console.log(message) });
  vi.useRealTimers();
  console.log("\nKết quả:");
  for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
  const revenue = await db.execute(
    "SELECT COALESCE(SUM(total), 0)::bigint AS total FROM orders WHERE status = 'completed' AND customer_email LIKE '%@demo.robotica.vn'",
  );
  console.log(`  Doanh thu đơn hoàn tất: ${Number(revenue.rows[0].total).toLocaleString("vi-VN")} đ`);
  console.log(`Xong sau ${Math.round((performance.now() - started) / 1000)} giây.`);
}, 6 * 3_600_000);
