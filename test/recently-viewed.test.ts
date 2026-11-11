import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const viewed = await import("@/server/repo/recently-viewed");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const users = await import("@/server/repo/users");

let userId = "";
beforeAll(async () => {
  await getDb();
  userId = (await createUser("customer")).id;
});
afterAll(cleanup);

const slugsOf = async (id: string, limit = 50) => (await viewed.listRecentlyViewed(id, limit)).map((p) => p.slug);

describe("đã xem gần đây", () => {
  it("ghi theo thứ tự trình duyệt gửi, xem lại thì lên đầu, bỏ slug không có", async () => {
    await viewed.recordViews(userId, ["bruticus", "onslaught", "khong-co-san-pham-nay"], 1_000_000);
    expect(await slugsOf(userId)).toEqual(["bruticus", "onslaught"]);
    await viewed.recordViews(userId, ["onslaught"], 2_000_000);
    expect(await slugsOf(userId)).toEqual(["onslaught", "bruticus"]);
    // Thiết bị khác gửi danh sách cũ hơn: không đẩy lùi thời điểm đã có.
    await viewed.recordViews(userId, ["bruticus"], 1_500_000);
    expect(await slugsOf(userId)).toEqual(["onslaught", "bruticus"]);
  });

  it("chỉ giữ 30 sản phẩm gần nhất, chỉ hiện sản phẩm còn bán", async () => {
    const all = (await products.queryProducts({ pageSize: 100 })).items.map((p) => p.slug);
    expect(all.length).toBeGreaterThan(viewed.KEEP_PER_USER);
    await viewed.recordViews(userId, all, 3_000_000);
    const kept = await slugsOf(userId);
    expect(kept).toEqual(all.slice(0, viewed.KEEP_PER_USER));

    const db = await getDb();
    await db.execute({ sql: "UPDATE products SET status = 'archived' WHERE slug = ?", args: [all[0]] });
    expect(await slugsOf(userId)).not.toContain(all[0]);
    await db.execute({ sql: "UPDATE products SET status = 'published' WHERE slug = ?", args: [all[0]] });
  });

  it("xoá lịch sử; xoá tài khoản thì mất lịch sử, tải dữ liệu thì có lịch sử", async () => {
    const other = (await createUser("customer")).id;
    await viewed.recordViews(other, ["brawl", "swindle"], 5_000_000);
    expect((await users.exportAccountData(other)).recentlyViewed.map((r) => r.product)).toHaveLength(2);
    await users.anonymizeAccount(other, "x");
    expect(await slugsOf(other)).toEqual([]);

    await viewed.clearRecentlyViewed(userId);
    expect(await slugsOf(userId)).toEqual([]);
  });
});

describe("mua lại", () => {
  it("dòng đơn giữ cấu hình Xưởng gốc để thêm lại đúng tuỳ biến", async () => {
    const product = (await products.findProductBySlug("bruticus"))!;
    const created = await orders.createOrder({
      userId: null,
      paymentMethod: "cod",
      customerName: "Khách",
      customerPhone: "0901234567",
      customerEmail: "",
      shippingAddress: "1 Lê Lợi",
      shippingCity: "Huế",
      note: "",
      idempotencyKey: null,
      items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const order = (await orders.findOrderById(created.order.id))!;
    expect(order.items[0]).toMatchObject({ variantId: product.variantId, quantity: 1, optionsConfig: "" });
  });
});
