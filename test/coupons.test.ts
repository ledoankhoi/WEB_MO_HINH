import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { couponDiscount } from "@/lib/pricing";
import { setupTempDatabase } from "./helpers/temp-db";
import type { CouponInput } from "@/server/repo/coupons";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const orders = await import("@/server/repo/orders");
const coupons = await import("@/server/repo/coupons");
const inventory = await import("@/server/repo/inventory");

const entry = { actor: { id: null, role: "admin" }, action: "coupon.create", entity: "coupons", summary: "test" };
const base: Omit<CouponInput, "code"> = { kind: "fixed", value: 50_000, maxDiscount: null, minSubtotal: 0, categoryId: null, startsAt: null, endsAt: null, usageLimit: null, isActive: true };
const customer = {
  userId: null,
  paymentMethod: "cod" as const,
  customerName: "Nguyễn Văn A",
  customerPhone: "0901234567",
  customerEmail: "",
  shippingAddress: "12 Lê Lợi",
  shippingCity: "Đà Nẵng",
  note: "",
  idempotencyKey: null,
};

type Item = { variantId: string; price: number; categoryId: string };
let items: Item[];
const create = async (code: string, extra: Partial<typeof base> = {}) => {
  const id = await coupons.saveCoupon(null, { ...base, code, ...extra }, entry);
  if (!id || id === "duplicate") throw new Error("không tạo được mã");
  return id;
};
const place = (couponCode: string, item = items[0]) =>
  orders.createOrder({ ...customer, couponCode, items: [{ variantId: item.variantId, quantity: 1, expectedPrice: item.price }] });

beforeAll(async () => {
  const db = await getDb();
  const result = await db.execute("SELECT variant_id, price, category_id FROM product_list WHERE stock >= 3 ORDER BY price DESC LIMIT 20");
  items = result.rows.map((row) => ({ variantId: String(row.variant_id), price: Number(row.price), categoryId: String(row.category_id) }));
});
afterAll(cleanup);

describe("mã giảm giá (T18)", () => {
  it("cách tính: phần trăm làm tròn xuống, có trần, không vượt phần được giảm", () => {
    expect(couponDiscount({ kind: "percent", value: 15, maxDiscount: null }, 99_999)).toBe(14_999);
    expect(couponDiscount({ kind: "percent", value: 50, maxDiscount: 100_000 }, 1_000_000)).toBe(100_000);
    expect(couponDiscount({ kind: "fixed", value: 500_000, maxDiscount: null }, 200_000)).toBe(200_000);
    expect(couponDiscount({ kind: "fixed", value: 500_000, maxDiscount: null }, 0)).toBe(0);
  });

  it("EC-06: từ chối đúng lý do; mã hợp lệ thì tổng = tạm tính − giảm + phí vận chuyển", async () => {
    const [item] = items;
    const line = [{ variantId: item.variantId, price: item.price, quantity: 1 }];
    await create("TAT", { isActive: false });
    await create("SAP", { startsAt: Date.now() + 86_400_000 });
    await create("HET", { startsAt: Date.now() - 2 * 86_400_000, endsAt: Date.now() - 86_400_000 });
    await create("TOITHIEU", { minSubtotal: item.price + 1 });
    const other = items.find((i) => i.categoryId !== item.categoryId)!;
    await create("DANHMUC", { categoryId: other.categoryId });

    expect(await coupons.evaluateCoupon("khongco", line)).toEqual({ ok: false, reason: "not_found" });
    expect(await coupons.evaluateCoupon("tat", line)).toMatchObject({ reason: "inactive" });
    expect(await coupons.evaluateCoupon("SAP", line)).toMatchObject({ reason: "not_started" });
    expect(await coupons.evaluateCoupon("HET", line)).toMatchObject({ reason: "expired" });
    expect(await coupons.evaluateCoupon("TOITHIEU", line)).toMatchObject({ reason: "min_subtotal", minSubtotal: item.price + 1 });
    expect(await coupons.evaluateCoupon("DANHMUC", line)).toMatchObject({ reason: "category" });
    expect(await place("HET")).toMatchObject({ ok: false, reason: "coupon", coupon: "expired" });

    await create("GIAM50K");
    const created = await place("giam50k");
    if (!created.ok) throw new Error("không tạo được đơn");
    const order = (await orders.findOrderById(created.order.id))!;
    expect(order).toMatchObject({ discount: 50_000, couponCode: "GIAM50K", subtotal: item.price, total: item.price - 50_000 + order.shippingFee });
    expect(created.order.total).toBe(order.total);
  });

  it("EC-07: huỷ đơn trả lại lượt đúng một lần; hết lượt thì đơn sau bị từ chối", async () => {
    const id = await create("MOTLUOT", { usageLimit: 1 });
    const used = async () => (await coupons.listCoupons()).find((c) => c.id === id)!.usedCount;

    const first = await place("MOTLUOT");
    if (!first.ok) throw new Error("không tạo được đơn");
    expect(await used()).toBe(1);
    expect(await place("MOTLUOT", items[1])).toMatchObject({ ok: false, reason: "coupon", coupon: "exhausted" });

    expect(await orders.applyOrderAction(first.order.id, "customer_cancel")).toBe(true);
    expect(await orders.applyOrderAction(first.order.id, "customer_cancel")).toBe(false);
    expect(await used()).toBe(0);
    expect((await place("MOTLUOT", items[1])).ok).toBe(true);
    expect(await used()).toBe(1);
    expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
  });

  it("hai đơn tranh lượt cuối cùng: chỉ một đơn dùng được mã, đơn kia không ghi gì", async () => {
    await create("LUOTCUOI", { usageLimit: 1 });
    const results = await Promise.all([place("LUOTCUOI", items[2]), place("LUOTCUOI", items[3])]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "coupon", coupon: "exhausted" });
    const db = await getDb();
    const redemptions = await db.execute("SELECT COUNT(*) AS n FROM coupon_redemptions r JOIN coupons c ON c.id = r.coupon_id WHERE c.code = 'LUOTCUOI'");
    expect(Number(redemptions.rows[0].n)).toBe(1);
  });

  it("không tạo trùng mã; không hạ hạn mức dưới số lượt đã dùng", async () => {
    expect(await coupons.saveCoupon(null, { ...base, code: "giam50k" }, entry)).toBe("duplicate");
    const id = (await coupons.listCoupons()).find((c) => c.code === "MOTLUOT")!.id;
    expect(await coupons.saveCoupon(id, { ...base, code: "MOTLUOT", usageLimit: 0 }, entry)).toBeNull();
  });
});
