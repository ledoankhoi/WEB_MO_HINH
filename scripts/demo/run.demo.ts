import { afterAll, it, vi } from "vitest";
import { setupTempDatabase } from "../../test/helpers/temp-db";

// Chạy bộ sinh dữ liệu mẫu qua Vitest để dùng được mã của cửa hàng (alias @/, server-only) và đồng hồ giả.
// Gọi bằng scripts/demo-data.mjs. Biến môi trường:
//   DEMO_PART=extras   phần hai (seed-extras.ts), chạy sau phần một; chạy lại chỉ làm các mục còn thiếu
//   DEMO_PART=details  phần ba (seed-details.ts): làm nốt phần hai nếu còn thiếu, rồi bổ sung chi tiết
//   DEMO_RESUME=1      chạy tiếp phần một sau khi bị dừng giữa chừng
//   DEMO_DRY=1         chạy trên PGlite (không đụng CSDL thật) để xem trước; phần hai, ba thì chạy các phần trước nó
const dry = process.env.DEMO_DRY === "1";
const part = process.env.DEMO_PART === "extras" || process.env.DEMO_PART === "details" ? process.env.DEMO_PART : "main";
const cleanup = dry ? setupTempDatabase() : null;
const { getDb } = await import("@/server/db");
const { seedDemo } = await import("./seed-demo");
const { seedExtras } = await import("./seed-extras");
const { seedDetails } = await import("./seed-details");
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
  const setClock = (ms: number) => vi.setSystemTime(ms);
  const log = (message: string) => console.log(message);
  console.log(`${dry ? "[THỬ, PGlite] " : ""}Sinh dữ liệu mẫu (${part}), quy mô ${scale}...`);
  vi.useFakeTimers({ toFake: ["Date"] });
  const started = performance.now();
  let summary: Record<string, number> = {};
  if (part === "main") {
    summary = await seedDemo({ now, days, scale, resume: process.env.DEMO_RESUME === "1", setClock, log });
  } else {
    if (dry) await seedDemo({ now, days, scale, setClock, log: () => {} });
    const extras = await seedExtras({ now, scale, setClock, log });
    if (part === "details") {
      for (const [key, value] of Object.entries(extras)) if (key !== "Lệch sổ kho" && value > 0) summary[`Phần hai: ${key}`] = value;
      summary = { ...summary, ...(await seedDetails({ now, setClock, log })) };
    } else {
      summary = extras;
    }
  }
  vi.useRealTimers();
  console.log("\nKết quả:");
  for (const [key, value] of Object.entries(summary)) console.log(`  ${key}: ${value}`);
  const revenue = await db.execute(
    "SELECT COALESCE(SUM(total), 0)::bigint AS total FROM orders WHERE status = 'completed' AND customer_email LIKE '%@demo.robotica.vn'",
  );
  console.log(`  Doanh thu đơn hoàn tất: ${Number(revenue.rows[0].total).toLocaleString("vi-VN")} đ`);
  console.log(`Xong sau ${Math.round((performance.now() - started) / 1000)} giây.`);

  // DEMO_SAMPLE=1: in vài mẫu nội dung để đọc lại câu chữ.
  if (process.env.DEMO_SAMPLE === "1") {
    const demo = "%@demo.robotica.vn";
    const [reviews, questions, comments, products] = await db.batch([
      { sql: "SELECT rv.rating, p.name, rv.comment FROM reviews rv JOIN products p ON p.id = rv.product_id JOIN users u ON u.id = rv.user_id WHERE u.email LIKE ? AND rv.comment <> '' ORDER BY random() LIMIT 12", args: [demo] },
      {
        sql: `SELECT p.name, q.body AS q, (SELECT string_agg(a.body, ' || ' ORDER BY a.created_at) FROM product_answers a WHERE a.question_id = q.id) AS a
              FROM product_questions q JOIN products p ON p.id = q.product_id JOIN users u ON u.id = q.user_id WHERE u.email LIKE ? ORDER BY random() LIMIT 6`,
        args: [demo],
      },
      {
        sql: `SELECT cp.topic, cp.body, (SELECT string_agg(c.body, ' || ' ORDER BY c.created_at) FROM community_comments c WHERE c.post_id = cp.id) AS comments
              FROM community_posts cp JOIN users u ON u.id = cp.user_id WHERE u.email LIKE ? ORDER BY random() LIMIT 5`,
        args: [demo],
      },
      { sql: "SELECT name, scale, grade, box_contents, meta_title, meta_description FROM products WHERE status = 'published' ORDER BY random() LIMIT 3", args: [] },
    ]);
    console.log("\n--- Mẫu đánh giá ---");
    for (const row of reviews.rows) console.log(`[${row.rating}★ ${row.name}] ${row.comment}`);
    console.log("\n--- Mẫu hỏi đáp ---");
    for (const row of questions.rows) console.log(`[${row.name}] H: ${row.q}\n   Đ: ${row.a ?? "(chưa trả lời)"}`);
    console.log("\n--- Mẫu cộng đồng ---");
    for (const row of comments.rows) console.log(`[${row.topic}] ${row.body}\n   BL: ${row.comments ?? "(không có)"}`);
    console.log("\n--- Mẫu sản phẩm ---");
    for (const row of products.rows) console.log(`${row.name} | tỉ lệ ${row.scale ?? "—"} | cấp ${row.grade ?? "—"}\n   Trong hộp: ${String(row.box_contents).replace(/\n/g, " / ")}\n   SEO: ${row.meta_title} — ${row.meta_description}`);
  }
}, 6 * 3_600_000);
