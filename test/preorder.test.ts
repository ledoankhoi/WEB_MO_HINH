import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const preorders = await import("@/server/repo/preorders");
type OfferInput = import("@/server/repo/preorders").OfferInput;
const inventory = await import("@/server/repo/inventory");
const documents = await import("@/server/repo/stock-documents");
const warehouse = await import("@/server/repo/warehouse");
const { attemptCovers } = await import("@/server/repo/payment-attempts");
const { orderStage } = await import("@/lib/order-stage");
const { canApply } = await import("@/lib/order-flow");
const { amountDue, lineDeposit, orderDeposit, orderableQty, parsePreorder } = await import("@/lib/preorder");

const DAY = 24 * 3600 * 1000;
type Entry = Parameters<typeof documents.postDocument>[1];
let entry: Entry;
let a01 = "";

const customer = {
  userId: null,
  paymentMethod: "cod" as "cod" | "bank" | "vnpay",
  customerName: "Khách đặt trước",
  customerPhone: "0901234567",
  customerEmail: "",
  shippingAddress: "12 Lê Lợi",
  shippingCity: "Huế",
  note: "",
  idempotencyKey: null,
};

beforeAll(async () => {
  await getDb();
  const user = await createUser("admin");
  entry = { actor: { id: user.id, role: "admin" }, action: "test", entity: "preorder_offers", summary: "test" };
  a01 = (await warehouse.listLocations()).find((l) => l.code === "A-01")!.id;
});

// Sổ kho và số dư phải luôn khớp, kể cả với dòng đặt trước chưa giữ hàng (YC-KHO-18).
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
});

afterAll(cleanup);

// Hàng về: lập và ghi sổ phiếu nhập như ở /admin/kho/phieu.
async function receive(variantId: string, qty: number) {
  const id = await documents.createDocument("receipt", entry);
  await documents.saveDraft(id, {
    supplierId: null,
    orderId: null,
    reasonCode: "",
    reference: "",
    note: "",
    expectedAt: null,
    lines: [{ variantId, locationId: a01, toLocationId: null, qtyExpected: null, qty, qtyQuarantined: null, systemQty: null, unitCost: 100_000, note: "" }],
  });
  expect((await documents.postDocument(id, entry)).ok).toBe(true);
}

async function stockOf(variantId: string) {
  return (await products.findCartProducts([variantId]))[0];
}

// Mở đợt cho biến thể mặc định của một sản phẩm mẫu.
async function openOffer(slug: string, input: Partial<OfferInput> = {}) {
  const product = (await products.findProductBySlug(slug))!;
  const created = await preorders.createOffer(product.variantId, { expectedAt: Date.now() + 30 * DAY, depositPercent: 30, maxQty: null, note: "", ...input }, entry);
  if (!created.ok) throw new Error(`không mở được đợt ${slug}: ${created.reason}`);
  return { product, offerId: created.id };
}

async function place(variantId: string, quantity: number, extra: Partial<Parameters<typeof orders.createOrder>[0]> = {}) {
  const fresh = (await stockOf(variantId))!;
  return orders.createOrder({ ...customer, items: [{ variantId, quantity, expectedPrice: fresh.price }], ...extra });
}

async function placed(variantId: string, quantity: number, extra: Partial<Parameters<typeof orders.createOrder>[0]> = {}) {
  const result = await place(variantId, quantity, extra);
  if (!result.ok) throw new Error(`không đặt được: ${JSON.stringify(result)}`);
  return (await orders.findOrderById(result.order.id))!;
}

describe("tính tiền cọc và suất", () => {
  it("cọc làm tròn lên nghìn đồng; cọc từ tổng đơn trở lên thì phải trả đủ", () => {
    expect(lineDeposit(1_234_567, 1, 30)).toBe(371_000);
    expect(lineDeposit(1_000_000, 2, 0)).toBe(0);
    expect(lineDeposit(500_000, 1, 100)).toBe(500_000);
    expect(orderDeposit(300_000, 1_000_000, "deposit")).toBe(300_000);
    expect(orderDeposit(300_000, 1_000_000, "full")).toBe(0);
    expect(orderDeposit(1_000_000, 1_000_000, "deposit")).toBe(0);
  });

  it("số tiền cần trả kế tiếp và số lượng đặt được", () => {
    expect(amountDue({ total: 1_000_000, depositAmount: 300_000, paymentStatus: "unpaid" })).toBe(300_000);
    expect(amountDue({ total: 1_000_000, depositAmount: 300_000, paymentStatus: "deposit_paid" })).toBe(700_000);
    expect(amountDue({ total: 1_000_000, depositAmount: 0, paymentStatus: "unpaid" })).toBe(1_000_000);
    expect(amountDue({ total: 1_000_000, depositAmount: 300_000, paymentStatus: "paid" })).toBe(0);
    const offer = parsePreorder({ id: "x", status: "open", expectedAt: 1, depositPercent: 30, maxQty: 5, taken: 3, note: "" })!;
    expect(offer.left).toBe(2);
    expect(orderableQty(0, offer, 10)).toBe(2);
    expect(orderableQty(0, { ...offer, status: "closed" }, 10)).toBe(0);
    expect(orderableQty(7, null, 10)).toBe(7);
    expect(parsePreorder("không phải json")).toBeNull();
  });

  it("VNPay: lượt thanh toán khớp đúng khoản đơn đang chờ", () => {
    const order = { total: 1_000_000, depositAmount: 300_000 };
    expect(attemptCovers({ ...order, paymentStatus: "unpaid" }, 300_000)).toEqual({ kind: "deposit", from: "unpaid", to: "deposit_paid" });
    expect(attemptCovers({ ...order, paymentStatus: "unpaid" }, 1_000_000)).toEqual({ kind: "charge", from: "unpaid", to: "paid" });
    expect(attemptCovers({ ...order, paymentStatus: "deposit_paid" }, 700_000)).toEqual({ kind: "charge", from: "deposit_paid", to: "paid" });
    expect(attemptCovers({ ...order, paymentStatus: "deposit_paid" }, 300_000)).toBe("duplicate");
    expect(attemptCovers({ ...order, paymentStatus: "unpaid" }, 123)).toBe("amount");
    expect(attemptCovers({ ...order, paymentStatus: "paid" }, 700_000)).toBe("duplicate");
  });
});

describe("đợt đặt trước", () => {
  it("mỗi phiên bản một đợt chưa kết thúc; sản phẩm hiện nhãn đặt trước ở thẻ, trang chi tiết, giỏ", async () => {
    const { product, offerId } = await openOffer("bruticus", { maxQty: 5 });
    const again = await preorders.createOffer(product.variantId, { expectedAt: Date.now() + DAY, depositPercent: 10, maxQty: null, note: "" }, entry);
    expect(again).toEqual({ ok: false, reason: "exists" });

    const card = (await products.queryProducts({ q: "bruticus" })).items[0];
    expect(card.preorder).toMatchObject({ id: offerId, status: "open", depositPercent: 30, left: 5 });
    const detail = (await products.findProductBySlug("bruticus"))!;
    expect(detail.variants[0].preorder?.id).toBe(offerId);
    expect((await stockOf(product.variantId))!.preorder?.id).toBe(offerId);
    expect((await preorders.listComingProducts()).map((item) => item.product.slug)).toContain("bruticus");
  });

  it("đặt trước không giữ tồn kho, chiếm suất; hết suất thì từ chối; đang có đợt thì không bán thường", async () => {
    const { product, offerId } = await openOffer("onslaught", { maxQty: 3, depositPercent: 0 });
    const before = (await stockOf(product.variantId))!.stock;

    const first = await placed(product.variantId, 2);
    expect(first.preorderStatus).toBe("waiting");
    expect(first.depositAmount).toBe(0);
    expect(first.items[0].preorder).toMatchObject({ offerId, allocated: false });
    expect((await stockOf(product.variantId))!.stock).toBe(before);
    expect((await stockOf(product.variantId))!.preorder?.left).toBe(1);

    const tooMany = await place(product.variantId, 2);
    expect(tooMany).toMatchObject({ ok: false, reason: "cart_changed", issues: [{ reason: "preorder_full" }] });
    // Trình duyệt tưởng là hàng có sẵn (mở trang trước khi đợt mở): báo giỏ đã đổi.
    const stale = await place(product.variantId, 1, { items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price, preorder: false }] });
    expect(stale).toMatchObject({ ok: false, issues: [{ reason: "preorder_changed" }] });

    // Huỷ đơn trả lại suất, không đụng tới tồn kho (chưa giữ gì).
    expect(await orders.applyOrderAction(first.id, "customer_cancel")).toBe(true);
    expect((await stockOf(product.variantId))!.preorder?.left).toBe(3);
    expect((await stockOf(product.variantId))!.stock).toBe(before);
  });

  it("hai khách cùng đặt suất cuối: chỉ một người được", async () => {
    const { product } = await openOffer("brawl", { maxQty: 1, depositPercent: 0 });
    const results = await Promise.all([place(product.variantId, 1), place(product.variantId, 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("ngừng nhận đặt thì không đặt được; mở lại thì được", async () => {
    const { product, offerId } = await openOffer("swindle", { depositPercent: 0 });
    expect(await preorders.setOfferAccepting(offerId, false, entry)).toBe(true);
    expect(await place(product.variantId, 1)).toMatchObject({ ok: false, issues: [{ reason: "preorder_full" }] });
    expect(await preorders.setOfferAccepting(offerId, true, entry)).toBe(true);
    expect((await place(product.variantId, 1)).ok).toBe(true);
  });
});

describe("đặt cọc, hàng về, giao hàng", () => {
  it("cọc → xác nhận → chờ hàng về → phân bổ theo thứ tự đặt → đóng gói, giao, thu phần còn lại", async () => {
    const { product, offerId } = await openOffer("vortex", { depositPercent: 30 });
    const variantId = product.variantId;

    // Trả đủ khi nhận (COD không cọc) không được; COD + cọc chuyển khoản thì được.
    expect(await place(variantId, 1, { paymentPlan: "full" })).toEqual({ ok: false, reason: "prepayment" });
    const a = await placed(variantId, 2);
    const b = await placed(variantId, 1, { paymentMethod: "bank", paymentPlan: "full" });
    const c = await placed(variantId, 1);
    expect(a.depositAmount).toBe(lineDeposit(product.price, 2, 30));
    expect(b.depositAmount).toBe(0);

    // Chưa nhận cọc: chưa xác nhận được; đơn nằm ở "chờ khách thanh toán".
    expect(orderStage(a)).toBe("cho-chuyen-khoan");
    expect(canApply("confirm", a)).toBe(false);
    expect(await orders.applyOrderAction(a.id, "confirm")).toBe(false);
    expect(await orders.applyOrderAction(a.id, "mark_deposit")).toBe(true);
    expect(await orders.applyOrderAction(b.id, "mark_deposit")).toBe(false);
    expect(await orders.applyOrderAction(b.id, "mark_paid")).toBe(true);
    for (const id of [a.id, b.id]) expect(await orders.applyOrderAction(id, "confirm")).toBe(true);

    const waiting = (await orders.findOrderById(a.id))!;
    expect(waiting.paymentStatus).toBe("deposit_paid");
    expect(waiting.payments).toMatchObject([{ kind: "deposit", amount: a.depositAmount }]);
    expect(orderStage(waiting)).toBe("cho-hang-ve");
    // Hàng chưa về: chưa đóng gói được.
    expect(await orders.applyOrderAction(a.id, "start_packing")).toBe(false);

    // Hàng về 3 cái: a (2) rồi b (1) nhận hàng; c chưa cọc nên bị bỏ qua.
    const onHand = (await stockOf(variantId))!.stock;
    await receive(variantId, 3);
    const allocation = (await preorders.allocateOffer(offerId, entry))!;
    expect(allocation).toEqual({ allocated: 2, readyOrders: [a.id, b.id], short: 0, unpaidSkipped: 1 });
    expect((await stockOf(variantId))!.stock).toBe(onHand);
    // Bấm lại không giữ trùng.
    expect((await preorders.allocateOffer(offerId, entry))!.allocated).toBe(0);

    const ready = (await orders.findOrderById(a.id))!;
    expect(ready.preorderStatus).toBe("ready");
    expect(ready.items[0].preorder?.allocated).toBe(true);
    expect(ready.events.some((e) => e.field === "preorder_status" && e.to === "ready")).toBe(true);
    expect(orderStage(ready)).toBe("cho-dong-goi");

    // Đợt còn đơn c chờ hàng: chưa kết thúc được.
    expect(await preorders.endOffer(offerId, entry)).toBe("waiting");

    for (const key of ["start_packing", "packed"] as const) expect(await orders.applyOrderAction(a.id, key)).toBe(true);
    expect(await orders.applyOrderAction(a.id, "hand_over", undefined, { tracking: { carrier: "GHN", code: "GHN-PRE-1" } })).toBe(true);
    expect(await orders.applyOrderAction(a.id, "delivered")).toBe(true);
    expect(orderStage((await orders.findOrderById(a.id))!)).toBe("cho-thu-tien");
    // Người giao thu phần còn lại: L2 ghi đúng tổng − cọc, rồi L8 hoàn tất.
    expect(await orders.applyOrderAction(a.id, "mark_paid")).toBe(true);
    const done = (await orders.findOrderById(a.id))!;
    expect(done.status).toBe("completed");
    expect(done.payments.map((p) => [p.kind, p.amount])).toEqual([
      ["deposit", a.depositAmount],
      ["charge", a.total - a.depositAmount],
    ]);

    // Huỷ đơn c (chưa giữ hàng) rồi kết thúc đợt: phiên bản bán lại như thường.
    expect(await orders.applyOrderAction(c.id, "cancel")).toBe(true);
    expect(await preorders.endOffer(offerId, entry)).toBe("ended");
    expect((await stockOf(variantId))!.preorder).toBeNull();
  });

  it("hàng về không đủ: dừng ở đơn đầu tiên không đủ (không nhảy cóc)", async () => {
    const { product, offerId } = await openOffer("blast-off", { depositPercent: 0 });
    const onHand = (await stockOf(product.variantId))!.stock;
    expect(onHand).toBeLessThan(10);
    // Đơn đầu cần nhiều hơn số đang có một cái, đơn sau chỉ cần một: chưa đủ cho đơn đầu thì đơn sau cũng phải chờ.
    const first = await placed(product.variantId, onHand + 1);
    const second = await placed(product.variantId, 1);
    expect(await preorders.allocateOffer(offerId, entry)).toEqual({ allocated: 0, readyOrders: [], short: 2, unpaidSkipped: 0 });
    await receive(product.variantId, 1);
    expect(await preorders.allocateOffer(offerId, entry)).toEqual({ allocated: 1, readyOrders: [first.id], short: 1, unpaidSkipped: 0 });
    expect((await orders.findOrderById(second.id))!.preorderStatus).toBe("waiting");
    const offer = (await preorders.findOffer(offerId))!;
    expect(offer).toMatchObject({ taken: onHand + 2, allocated: onHand + 1, waiting: 1, available: 0 });
  });

  it("huỷ đơn đã cọc: chờ hoàn tiền, hoàn đúng số đã thu", async () => {
    const { product } = await openOffer("wild-force-megazord", { depositPercent: 50 });
    const order = await placed(product.variantId, 1);
    expect(await orders.applyOrderAction(order.id, "mark_deposit")).toBe(true);
    expect(await orders.applyOrderAction(order.id, "cancel")).toBe(true);
    const cancelled = (await orders.findOrderById(order.id))!;
    expect(orderStage(cancelled)).toBe("cho-hoan-tien");
    expect((await orders.listOrders({ refundPending: true })).items.map((o) => o.id)).toContain(order.id);
    expect(await orders.applyOrderAction(order.id, "refund")).toBe(true);
    const refunded = (await orders.findOrderById(order.id))!;
    expect(refunded.paymentStatus).toBe("refunded");
    expect(refunded.payments.find((p) => p.kind === "refund")?.amount).toBe(order.depositAmount);
  });

  it("đơn trộn hàng có sẵn và đặt trước: hàng có sẵn giữ ngay, huỷ thì trả đúng phần đã giữ", async () => {
    const { product: pre } = await openOffer("bumblebee-hand-cannon", { depositPercent: 0 });
    const normal = (await products.queryProducts({ inStock: true, pageSize: 50 })).items.find((p) => !p.preorder && p.stock >= 1)!;
    const before = (await stockOf(normal.variantId))!.stock;
    const result = await orders.createOrder({
      ...customer,
      items: [
        { variantId: pre.variantId, quantity: 1, expectedPrice: pre.price },
        { variantId: normal.variantId, quantity: 1, expectedPrice: normal.price },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await stockOf(normal.variantId))!.stock).toBe(before - 1);
    expect((await orders.findOrderById(result.order.id))!.preorderStatus).toBe("waiting");
    expect(await orders.applyOrderAction(result.order.id, "cancel")).toBe(true);
    expect((await stockOf(normal.variantId))!.stock).toBe(before);
  });
});
