import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const users = await import("@/server/repo/users");
const orders = await import("@/server/repo/orders");
const reviews = await import("@/server/repo/reviews");

const entry = { actor: { id: null, role: "support" }, action: "review", entity: "reviews", summary: "test" };
let buyer: string;
let other: string;
let productId: string;

async function placeOrder(userId: string, status: "pending" | "completed") {
  const db = await getDb();
  const row = (await db.execute("SELECT variant_id, price, id FROM product_list WHERE stock >= 2 ORDER BY slug LIMIT 1")).rows[0];
  productId = String(row.id);
  const created = await orders.createOrder({
    userId,
    paymentMethod: "cod",
    customerName: "Khách",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "12 Lê Lợi",
    shippingCity: "Đà Nẵng",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: String(row.variant_id), quantity: 1, expectedPrice: Number(row.price) }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  // Đi tắt vòng đời đơn: test này chỉ cần trạng thái cuối.
  if (status === "completed") await db.execute({ sql: "UPDATE orders SET status = 'completed' WHERE id = ?", args: [created.order.id] });
  return Number((await db.execute({ sql: "SELECT id FROM order_items WHERE order_id = ?", args: [created.order.id] })).rows[0].id);
}

beforeAll(async () => {
  await getDb();
  buyer = await users.insertUser({ email: "mua@example.com", name: "Người Mua", phone: "", passwordHash: "x" });
  other = await users.insertUser({ email: "khac@example.com", name: "Người Khác", phone: "", passwordHash: "x" });
});
afterAll(cleanup);

describe("đánh giá (T19)", () => {
  it("YC-DG-01: chỉ chủ đơn đã hoàn tất được gửi, mỗi dòng đơn một lần", async () => {
    const pendingItem = await placeOrder(buyer, "pending");
    const doneItem = await placeOrder(buyer, "completed");

    expect(await reviews.submitReview(buyer, pendingItem, 5, "")).toBe("not_allowed");
    expect(await reviews.submitReview(other, doneItem, 5, "")).toBe("not_allowed");
    expect((await reviews.listReviewableItems(buyer)).map((i) => i.orderItemId)).toEqual([doneItem]);

    expect(await reviews.submitReview(buyer, doneItem, 4, "Đẹp")).toBe("ok");
    expect(await reviews.submitReview(buyer, doneItem, 5, "Lần hai")).toBe("duplicate");
    expect(await reviews.listReviewableItems(buyer)).toEqual([]);
  });

  it("YC-DG-02: trang sản phẩm chỉ tính đánh giá đã duyệt; chuyển trạng thái đúng luật", async () => {
    expect(await reviews.listApprovedReviews(productId)).toMatchObject({ count: 0, items: [] });
    const [pending] = (await reviews.listReviews({ status: "pending" })).items;
    expect(pending).toMatchObject({ rating: 4, userName: "Người Mua" });

    expect(await reviews.setReviewStatus(pending.id, "approved", entry)).toBe(true);
    expect(await reviews.setReviewStatus(pending.id, "approved", entry)).toBe(false);
    const second = await placeOrder(buyer, "completed");
    await reviews.submitReview(buyer, second, 1, "");
    expect(await reviews.listApprovedReviews(productId)).toMatchObject({ count: 1, average: 4 });

    const newest = (await reviews.listReviews({ status: "pending" })).items[0];
    await reviews.setReviewStatus(newest.id, "approved", entry);
    expect(await reviews.listApprovedReviews(productId)).toMatchObject({ count: 2, average: 2.5 });

    expect(await reviews.setReviewStatus(pending.id, "hidden", entry)).toBe(true);
    expect(await reviews.listApprovedReviews(productId)).toMatchObject({ count: 1, average: 1 });
    expect((await reviews.listReviews({ rating: 4 })).items.map((r) => r.status)).toEqual(["hidden"]);
    expect(await reviews.setReviewStatus(pending.id, "approved", entry)).toBe(true);
  });
});
