import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const orders = await import("@/server/repo/orders");
const { salesReport } = await import("@/server/repo/sales-reports");
const { GET } = await import("@/app/admin/xuat/[loai]/route");

const DAY = 86400 * 1000;
// 00:00 ngày 01/03/2026 giờ Việt Nam.
const MAR1 = Date.UTC(2026, 2, 1) - 7 * 3600 * 1000;

type Item = { variantId: string; price: number; name: string };
let items: Item[];
async function place(item: Item, quantity: number, createdAt: number, status: string) {
  const created = await orders.createOrder({
    userId: null,
    paymentMethod: "cod",
    customerName: "Khách",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "12 Lê Lợi",
    shippingCity: "Đà Nẵng",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: item.variantId, quantity, expectedPrice: item.price }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  // Dựng dữ liệu: đặt thẳng ngày đặt và trạng thái cuối.
  const db = await getDb();
  await db.execute({ sql: "UPDATE orders SET created_at = ?, status = ? WHERE id = ?", args: [createdAt, status, created.order.id] });
  return created.order.total;
}

const csvOf = (loai: string, query: string) =>
  GET(new Request(`http://admin.localhost/admin/xuat/${loai}?${query}`), { params: Promise.resolve({ loai }) } as never);

let completedTotal = 0;
beforeAll(async () => {
  const db = await getDb();
  items = (await db.execute("SELECT variant_id, price, name FROM product_list WHERE stock >= 5 ORDER BY slug LIMIT 2")).rows.map((r) => ({
    variantId: String(r.variant_id),
    price: Number(r.price),
    name: String(r.name),
  }));
  // 23:30 ngày 01/03 giờ Việt Nam: phải nằm ở ngày 01/03 (kiểm cách chia ngày theo UTC+7).
  completedTotal += await place(items[0], 2, MAR1 + 23.5 * 3600 * 1000, "completed");
  completedTotal += await place(items[1], 1, MAR1 + DAY + 3600 * 1000, "completed");
  await place(items[1], 3, MAR1 + DAY + 7200 * 1000, "cancelled");
  await place(items[0], 1, MAR1 + 2 * DAY, "processing");
  // Ngoài khoảng.
  await place(items[0], 1, MAR1 - 1, "completed");
});
afterAll(cleanup);

describe("báo cáo bán hàng (T23)", () => {
  it("YC-BC-01: số đơn, doanh thu chỉ đơn hoàn tất, tỷ lệ huỷ, theo ngày giờ Việt Nam, bán chạy bỏ đơn huỷ", async () => {
    const report = await salesReport({ from: MAR1, to: MAR1 + 3 * DAY });
    expect(report.orders).toBe(4);
    expect(report.revenue).toBe(completedTotal);
    expect(report.cancelRate).toBe(0.25);
    expect(report.byStatus.cancelled.count).toBe(1);
    expect(report.daily.map((d) => [d.day, d.orders, d.completed, d.cancelled])).toEqual([
      [MAR1, 1, 1, 0],
      [MAR1 + DAY, 2, 1, 1],
      [MAR1 + 2 * DAY, 1, 0, 0],
    ]);
    expect(report.topProducts.map((p) => [p.name, p.quantity])).toEqual([
      [items[0].name, 3],
      [items[1].name, 1],
    ]);
  });

  it("YC-BC-03: CSV theo quyền reports.view; khoảng ngày sai thì 400", async () => {
    await signInAs((await createUser("warehouse")).id);
    expect((await csvOf("ban-hang", "tu=2026-03-01&den=2026-03-03")).status).toBe(403);

    await signInAs((await createUser("accountant")).id);
    const daily = await csvOf("ban-hang", "tu=2026-03-01&den=2026-03-03");
    expect(daily.status).toBe(200);
    const lines = (await daily.text()).replace(/^﻿/, "").trim().split(/\r?\n/);
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^2026-03-01,1,1,0,/);
    const top = await (await csvOf("ban-chay", "tu=2026-03-01&den=2026-03-03")).text();
    expect(top).toContain(items[0].name);
    expect((await csvOf("ban-hang", "tu=2026-03-05&den=2026-03-01")).status).toBe(400);
    expect((await csvOf("ban-hang", "tu=2025-01-01&den=2026-03-01")).status).toBe(400);
  });
});
