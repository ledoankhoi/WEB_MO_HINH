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
  }, 600_000);
});
