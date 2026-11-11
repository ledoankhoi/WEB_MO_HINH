import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const flash = await import("@/server/repo/flash-sales");
const inventory = await import("@/server/repo/inventory");
const { effectivePrice, flashLimit, flashState, formatCountdown, parseFlash } = await import("@/lib/flash-sale");

const HOUR = 3600 * 1000;
type Entry = Parameters<typeof flash.saveFlashSale>[2];
let entry: Entry;

const customer = {
  userId: null,
  paymentMethod: "cod" as const,
  customerName: "Khách săn sale",
  customerPhone: "0901234567",
  customerEmail: "",
  shippingAddress: "1 Lê Lợi",
  shippingCity: "Huế",
  note: "",
  idempotencyKey: null,
};

beforeAll(async () => {
  await getDb();
  const user = await createUser("marketing");
  entry = { actor: { id: user.id, role: "marketing" }, action: "test", entity: "flash_sales", summary: "test" };
});
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
});
afterAll(cleanup);

async function sale(slug: string, item: { salePrice?: number; qtyLimit?: number; maxPerOrder?: number | null } = {}, window = { from: -HOUR, to: HOUR }) {
  const product = (await products.findProductBySlug(slug))!;
  const now = Date.now();
  const saved = await flash.saveFlashSale(null, { title: "Giờ vàng", startsAt: now + window.from, endsAt: now + window.to, isActive: true }, entry);
  if (!saved.ok) throw new Error("không tạo được chương trình");
  const result = await flash.saveFlashItem(
    saved.id,
    { variantId: product.variantId, salePrice: item.salePrice ?? product.price - 100_000, qtyLimit: item.qtyLimit ?? 5, maxPerOrder: item.maxPerOrder ?? null },
    entry,
  );
  expect(result).toBe("ok");
  return { product, saleId: saved.id, salePrice: item.salePrice ?? product.price - 100_000 };
}

const cartOf = async (variantId: string, now?: number) => (await products.findCartProducts([variantId], now))[0];

const place = (variantId: string, quantity: number, expectedPrice: number) =>
  orders.createOrder({ ...customer, items: [{ variantId, quantity, expectedPrice }] });

describe("tính giá theo giờ", () => {
  it("giá sale chỉ khi đang chạy và còn suất; đếm ngược", () => {
    const offer = parseFlash({ saleId: "s", title: "T", price: 900, startsAt: 1000, endsAt: 2000, qtyLimit: 5, sold: 3, maxPerOrder: 1 })!;
    expect(offer.left).toBe(2);
    expect(flashLimit(offer)).toBe(1);
    expect(flashState(offer, 500)).toBe("upcoming");
    expect(flashState(offer, 1500)).toBe("live");
    expect(flashState(offer, 2000)).toBe("ended");
    expect(flashState({ ...offer, left: 0 }, 1500)).toBe("sold_out");
    expect(effectivePrice(1200, offer, 1500)).toBe(900);
    expect(effectivePrice(1200, offer, 2500)).toBe(1200);
    expect(formatCountdown(3 * 24 * HOUR + 3723_000)).toBe("3 ngày 01:02:03");
    expect(formatCountdown(59_000)).toBe("00:00:59");
  });
});

describe("chương trình flash sale", () => {
  it("giỏ và đơn tính giá sale lúc đặt; vượt tối đa mỗi đơn thì báo; đơn ghi chương trình", async () => {
    const { product, saleId, salePrice } = await sale("bruticus", { maxPerOrder: 2, qtyLimit: 3 });
    const live = (await cartOf(product.variantId))!;
    expect(live).toMatchObject({ price: salePrice, basePrice: product.price, flash: { saleId, left: 3 } });
    // Trước giờ bắt đầu và sau giờ kết thúc: giá thường.
    expect((await cartOf(product.variantId, Date.now() - 2 * HOUR))!.price).toBe(product.price);
    expect((await cartOf(product.variantId, Date.now() + 2 * HOUR))!.price).toBe(product.price);

    expect(await place(product.variantId, 3, salePrice)).toMatchObject({ ok: false, issues: [{ reason: "flash_limit" }] });
    expect(await place(product.variantId, 1, product.price)).toMatchObject({ ok: false, issues: [{ reason: "price_changed" }] });
    const ok = await place(product.variantId, 2, salePrice);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    const saved = (await orders.findOrderById(ok.order.id))!;
    expect(saved.items[0]).toMatchObject({ unitPrice: salePrice, flashSaleId: saleId });
    expect(saved.subtotal).toBe(2 * salePrice);

    // Còn 1 suất; huỷ đơn thì trả suất.
    expect((await cartOf(product.variantId))!.flash?.left).toBe(1);
    expect(await orders.applyOrderAction(ok.order.id, "customer_cancel")).toBe(true);
    expect((await cartOf(product.variantId))!.flash?.left).toBe(3);
  });

  it("hết suất thì về giá thường; hai khách tranh suất cuối chỉ một người được giá sale", async () => {
    const { product, salePrice } = await sale("onslaught", { qtyLimit: 1 });
    const results = await Promise.all([place(product.variantId, 1, salePrice), place(product.variantId, 1, salePrice)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const after = (await cartOf(product.variantId))!;
    expect(after.flash).toBeNull();
    expect(after.price).toBe(product.price);
  });

  it("thẻ sản phẩm và trang chủ có chương trình sắp chạy; tắt chương trình thì mất", async () => {
    const { product, saleId } = await sale("brawl", {}, { from: HOUR, to: 3 * HOUR });
    const card = (await products.queryProducts({ q: "brawl" })).items.find((p) => p.slug === "brawl")!;
    expect(card.flash).toMatchObject({ saleId });
    // Chưa tới giờ: giỏ vẫn giá thường.
    expect((await cartOf(product.variantId))!.price).toBe(product.price);
    const home = await flash.listStorefrontSales();
    expect(home.find((s) => s.id === saleId)?.products.map((p) => p.slug)).toEqual(["brawl"]);

    const found = (await flash.findFlashSale(saleId))!;
    expect(await flash.saveFlashSale(saleId, { ...found.sale, isActive: false }, entry)).toEqual({ ok: true, id: saleId });
    expect((await products.queryProducts({ q: "brawl" })).items.find((p) => p.slug === "brawl")!.flash).toBeNull();
  });

  it("chặn giá sale không thấp hơn giá thường, chồng giờ với chương trình khác, bỏ dòng đã có đơn", async () => {
    const { product, saleId, salePrice } = await sale("swindle");
    const other = await flash.saveFlashSale(null, { title: "Khác", startsAt: Date.now(), endsAt: Date.now() + 5 * HOUR, isActive: true }, entry);
    if (!other.ok) throw new Error("không tạo được");
    expect(await flash.saveFlashItem(other.id, { variantId: product.variantId, salePrice: 1000, qtyLimit: 1, maxPerOrder: null }, entry)).toBe("overlap");
    expect(await flash.saveFlashItem(saleId, { variantId: product.variantId, salePrice: product.price, qtyLimit: 1, maxPerOrder: null }, entry)).toBe("price");

    const ok = await place(product.variantId, 1, salePrice);
    expect(ok.ok).toBe(true);
    // Hạ số suất xuống đúng số đã bán thì được; thấp hơn thì không.
    expect(await flash.saveFlashItem(saleId, { variantId: product.variantId, salePrice, qtyLimit: 1, maxPerOrder: null }, entry)).toBe("ok");
    expect(await flash.removeFlashItem(saleId, product.variantId, entry)).toBe("sold");
    const detail = (await flash.findFlashSale(saleId))!;
    expect(detail.items[0]).toMatchObject({ sold: 1, qtyLimit: 1 });
    expect(detail.sale).toMatchObject({ itemCount: 1, sold: 1 });
  });
});
