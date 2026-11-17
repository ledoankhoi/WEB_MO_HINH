import { afterAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Bộ sinh dữ liệu mẫu (scripts/demo/seed-demo.ts) chạy thu nhỏ trên CSDL tạm: mọi bước đơn hàng phải hợp lệ và sổ kho
// không lệch. Bản chạy thật: npm run demo-data.
const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { seedDemo } = await import("../scripts/demo/seed-demo");
afterAll(async () => {
  vi.useRealTimers();
  await cleanup();
});

describe("dữ liệu mẫu", () => {
  it("tạo khách, đơn đủ trạng thái, đánh giá, bài cộng đồng, tin tức mà không lệch sổ kho", async () => {
    await getDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.UTC(2026, 10, 8, 9);
    const summary = await seedDemo({ now, days: 60, scale: 0.25, setClock: (ms) => vi.setSystemTime(ms), log: () => {} });

    expect(summary["Lệch sổ kho"]).toBe(0);
    expect(summary["Bước đơn bị từ chối"] ?? 0).toBe(0);
    expect(summary["Đơn không tạo được"] ?? 0).toBe(0);
    expect(summary["Đơn hàng"]).toBeGreaterThan(20);
    expect(summary["Đơn completed"]).toBeGreaterThan(10);
    expect(summary["Đánh giá"]).toBeGreaterThan(0);
    expect(summary["Tin tức"]).toBeGreaterThan(0);

    const db = await getDb();
    const [orders] = await db.batch([
      { sql: "SELECT MIN(created_at)::bigint AS first, MAX(created_at)::bigint AS last FROM orders WHERE customer_email LIKE '%@demo.robotica.vn'", args: [] },
    ]);
    expect(Number(orders.rows[0].first)).toBeGreaterThanOrEqual(now - 60 * 86_400_000);
    expect(Number(orders.rows[0].last)).toBeLessThan(now);

    // Chạy lần hai bị chặn.
    await expect(seedDemo({ now, days: 60, scale: 0.25, setClock: (ms) => vi.setSystemTime(ms), log: () => {} })).rejects.toThrow(/đã có dữ liệu mẫu/);

    // Chạy tiếp (sau khi bị dừng): chỉ thêm đơn sau đơn cuối, nhập bù hàng thiếu, không tạo lại khách, không lệch sổ kho.
    const later = now + 20 * 86_400_000;
    const customersBefore = Number((await db.execute("SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@demo.robotica.vn'")).rows[0].n);
    const lastOrder = Number((await db.execute("SELECT MAX(created_at)::bigint AS t FROM orders WHERE customer_email LIKE '%@demo.robotica.vn'")).rows[0].t);
    const more = await seedDemo({ now: later, days: 80, scale: 0.25, resume: true, setClock: (ms) => vi.setSystemTime(ms), log: () => {} });
    expect(more["Lệch sổ kho"]).toBe(0);
    expect(more["Bước đơn bị từ chối"] ?? 0).toBe(0);
    expect(more["Đơn không tạo được"] ?? 0).toBe(0);
    expect(more["Đơn hàng"]).toBeGreaterThan(5);
    expect(Number((await db.execute("SELECT COUNT(*)::int AS n FROM users WHERE email LIKE '%@demo.robotica.vn'")).rows[0].n)).toBe(customersBefore);
    const firstNew = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM orders WHERE customer_email LIKE '%@demo.robotica.vn' AND created_at > ?", args: [lastOrder] });
    expect(Number(firstNew.rows[0].n)).toBe(more["Đơn hàng"]);

    // Phần hai: flash sale, combo, hỏi đáp, chat, trả hàng đủ luồng, hoá đơn, xu, gacha. Chạy lại chỉ làm mục còn thiếu.
    const { seedExtras } = await import("../scripts/demo/seed-extras");
    const clock = (ms: number) => vi.setSystemTime(ms);
    const extras = await seedExtras({ now: later, scale: 0.3, setClock: clock, log: () => {} });
    expect(extras["Lệch sổ kho"]).toBe(0);
    for (const key of ["Flash sale", "Combo", "Câu hỏi", "Cuộc chat", "Yêu cầu trả hàng", "Lượt quay gacha"]) expect(extras[key], key).toBeGreaterThan(0);
    const again = await seedExtras({ now: later, scale: 0.3, setClock: clock, log: () => {} });
    expect(Object.keys(again).filter((key) => key !== "Lệch sổ kho")).toEqual([]);

    // Phần ba: chi tiết sản phẩm, viết lại nội dung cho hợp loại sản phẩm, đơn Xưởng/combo/gần đây, tin tức.
    const { seedDetails } = await import("../scripts/demo/seed-details");
    const details = await seedDetails({ now: later, setClock: clock, log: () => {} });
    expect(details["Lệch sổ kho"]).toBe(0);
    expect(details["Bước đơn bị từ chối"] ?? 0).toBe(0);
    expect(details["Đơn mới không tạo được"] ?? 0).toBe(0);
    expect(details["Đơn mới"]).toBeGreaterThan(5);
    expect(details["Đánh giá viết lại"]).toBeGreaterThan(0);

    const [box, workshop, combo, dupes, mismatch] = await db.batch([
      "SELECT COUNT(*)::int AS n FROM products WHERE status = 'published' AND COALESCE(box_contents, '') = ''",
      "SELECT COUNT(*)::int AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.idempotency_key LIKE 'demo3-workshop-%' AND oi.options_config <> ''",
      "SELECT COUNT(*)::int AS n FROM orders WHERE idempotency_key LIKE 'demo3-combo-%' AND discount > 0",
      "SELECT COALESCE(SUM(n - 1), 0)::int AS n FROM (SELECT COUNT(*) AS n FROM reviews WHERE comment <> '' GROUP BY comment HAVING COUNT(*) > 1) x",
      `SELECT COUNT(*)::int AS n FROM product_questions q JOIN products p ON p.id = q.product_id JOIN categories c ON c.id = p.category_id
       WHERE c.slug IN ('model-kits', 'phu-kien') AND q.body ILIKE '%biến hình%'`,
    ]);
    expect(Number(box.rows[0].n)).toBe(0);
    expect(Number(workshop.rows[0].n)).toBeGreaterThan(0);
    expect(Number(combo.rows[0].n)).toBeGreaterThan(0);
    expect(Number(dupes.rows[0].n)).toBeLessThanOrEqual(2);
    expect(Number(mismatch.rows[0].n)).toBe(0);
    // Bài cộng đồng không nói chuyện biến hình khi gắn với phụ kiện hay kit không biến hình.
    const badPosts = await db.execute(
      `SELECT COUNT(*)::int AS n FROM community_posts cp JOIN products p ON p.id = cp.product_id JOIN categories c ON c.id = p.category_id
       WHERE cp.body ILIKE '%biến hình%' AND (c.slug = 'phu-kien' OR (c.slug = 'model-kits' AND p.specs NOT LIKE '%Biến hình%'))`,
    );
    expect(Number(badPosts.rows[0].n)).toBe(0);

    // Chạy lại không tạo trùng đơn, tin tức.
    const ordersBefore = Number((await db.execute("SELECT COUNT(*)::int AS n FROM orders")).rows[0].n);
    const repeat = await seedDetails({ now: later, setClock: clock, log: () => {} });
    expect(repeat["Đơn mới"] ?? 0).toBe(0);
    expect(repeat["Tin tức mới"] ?? 0).toBe(0);
    expect(repeat["Bài cộng đồng chờ duyệt"] ?? 0).toBe(0);
    expect(repeat["Câu hỏi chờ trả lời"] ?? 0).toBe(0);
    expect(Number((await db.execute("SELECT COUNT(*)::int AS n FROM orders")).rows[0].n)).toBe(ordersBefore);
  }, 600_000);
});
