import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const bundles = await import("@/server/repo/bundles");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const { applyBundles } = await import("@/lib/bundles");

let audit: Parameters<typeof bundles.saveDeal>[2];
beforeAll(async () => {
  await getDb();
  const user = await createUser("marketing");
  audit = { actor: { id: user.id, role: "marketing" }, action: "test", entity: "bundle_deals", summary: "test" };
});
afterAll(cleanup);

describe("tính giảm combo", () => {
  const deal = { id: "d1", name: "Bộ A+B", percent: 10, productIds: ["a", "b"] };

  it("đủ bộ thì giảm, thiếu thì gợi ý món còn thiếu", () => {
    expect(applyBundles([{ productId: "a", unitPrice: 100_000, quantity: 1 }], [deal])).toEqual({
      discount: 0,
      applied: [],
      missing: [{ dealId: "d1", name: "Bộ A+B", percent: 10, missing: ["b"] }],
    });
    const full = applyBundles(
      [
        { productId: "a", unitPrice: 100_000, quantity: 1 },
        { productId: "b", unitPrice: 200_005, quantity: 1 },
      ],
      [deal],
    );
    expect(full.discount).toBe(30_000);
    expect(full.applied).toEqual([{ dealId: "d1", name: "Bộ A+B", percent: 10, sets: 1, amount: 30_000 }]);
  });

  it("nhiều bộ lấy món rẻ trước; một món chỉ tính cho một combo (combo giảm nhiều xét trước)", () => {
    const result = applyBundles(
      [
        { productId: "a", unitPrice: 100_000, quantity: 1 },
        { productId: "a", unitPrice: 50_000, quantity: 2 },
        { productId: "b", unitPrice: 100_000, quantity: 2 },
      ],
      [deal],
    );
    // 2 bộ: a dùng hai món 50.000, b dùng hai món 100.000.
    expect(result.applied[0]).toMatchObject({ sets: 2, amount: 30_000 });

    const both = applyBundles(
      [
        { productId: "a", unitPrice: 100_000, quantity: 1 },
        { productId: "b", unitPrice: 100_000, quantity: 1 },
        { productId: "c", unitPrice: 100_000, quantity: 1 },
      ],
      [deal, { id: "d2", name: "Bộ B+C", percent: 20, productIds: ["b", "c"] }],
    );
    expect(both.applied.map((a) => a.dealId)).toEqual(["d2"]);
    expect(both.missing).toEqual([{ dealId: "d1", name: "Bộ A+B", percent: 10, missing: ["b"] }]);
  });
});

describe("combo khi đặt hàng", () => {
  it("máy chủ tự áp combo đang bật; tắt combo thì không giảm", async () => {
    const [a, b] = await Promise.all(["onslaught", "brawl"].map(async (slug) => (await products.findProductBySlug(slug))!));
    const id = await bundles.saveDeal(null, { name: "Hai Combaticon", percent: 10, isActive: true, productIds: [a.id, b.id] }, audit);
    expect(typeof id).toBe("string");
    expect((await bundles.listDealsForProducts([a.id]))[0]).toMatchObject({ name: "Hai Combaticon", members: expect.any(Array) });

    const place = () =>
      orders.createOrder({
        userId: null,
        paymentMethod: "cod",
        customerName: "Khách",
        customerPhone: "0901234567",
        customerEmail: "",
        shippingAddress: "1 Lê Lợi",
        shippingCity: "Huế",
        note: "",
        idempotencyKey: null,
        items: [a, b].map((p) => ({ variantId: p.variantId, quantity: 1, expectedPrice: p.price })),
      });
    const created = await place();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const order = (await orders.findOrderById(created.order.id))!;
    const expected = Math.floor(((a.price + b.price) * 10) / 100);
    expect(order).toMatchObject({ bundleDiscount: expected, discount: expected, subtotal: a.price + b.price });
    expect(order.total).toBe(order.subtotal - expected + order.shippingFee);

    expect(await bundles.saveDeal(id as string, { name: "Hai Combaticon", percent: 10, isActive: false, productIds: [a.id, b.id] }, audit)).toBe(id);
    const again = await place();
    if (!again.ok) throw new Error("không đặt được");
    expect((await orders.findOrderById(again.order.id))!.bundleDiscount).toBe(0);
  });

  it("từ chối combo ít hơn 2 hoặc có sản phẩm không tồn tại", async () => {
    const a = (await products.findProductBySlug("swindle"))!;
    expect(await bundles.saveDeal(null, { name: "Một món", percent: 5, isActive: true, productIds: [a.id] }, audit)).toBe("products");
    expect(await bundles.saveDeal(null, { name: "Sai", percent: 5, isActive: true, productIds: [a.id, "khongcosanpham000000"] }, audit)).toBe("products");
  });
});
