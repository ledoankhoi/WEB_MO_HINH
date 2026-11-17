import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Chuyển khoản ngân hàng: khách báo đã chuyển, danh sách chờ đối soát, nhắc và tự huỷ đơn quá hạn trả trước.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": "10.0.0.8" }),
}));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

process.env.CRON_SECRET = "cron-secret-0123456789";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const inventory = await import("@/server/repo/inventory");
const transfers = await import("@/server/repo/bank-transfers");
const { claimTransferAction } = await import("@/app/actions/bank-transfer");
const { awaitsPrepayment, prepaymentDeadline } = await import("@/lib/bank-transfer");
const { GET: cronRoute } = await import("@/app/api/cron/dinh-ky/route");

const HOUR = 3_600_000;

async function placeOrder(paymentMethod: "bank" | "cod" | "vnpay", email = "ck@example.com", slug = "chars-zaku-ii") {
  const product = (await products.findProductBySlug(slug))!;
  const created = await orders.createOrder({
    userId: null, paymentMethod, customerName: "Khách CK", customerPhone: "0901234567", customerEmail: email, shippingAddress: "1 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  return { product, order: (await orders.findOrderById(created.order.id))! };
}

// Lùi giờ đặt đơn (và lịch sử) để giả lập thời gian trôi.
async function age(orderId: string, hours: number) {
  const db = await getDb();
  await db.execute({ sql: "UPDATE orders SET created_at = created_at - ? WHERE id = ?", args: [hours * HOUR, orderId] });
}

async function mailRefs(orderId: string) {
  const db = await getDb();
  return (await db.execute({ sql: "SELECT ref FROM email_outbox WHERE ref LIKE ? ORDER BY created_at", args: [`${orderId}:%`] })).rows.map((row) => String(row.ref).split(":")[1]);
}

const reserved = async (variantId: string) => {
  const db = await getDb();
  return Number((await db.execute({ sql: "SELECT reserved FROM inventory WHERE variant_id = ?", args: [variantId] })).rows[0].reserved);
};

beforeAll(async () => {
  await getDb();
});
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
  const db = await getDb();
  await db.execute("DELETE FROM rate_limits");
});
afterAll(cleanup);

describe("hạn trả trước", () => {
  it("đơn chuyển khoản, VNPay, COD có cọc mới phải trả trước; VNPay giữ ngắn hơn", () => {
    const base = { status: "pending", paymentStatus: "unpaid", depositAmount: 0 };
    expect(awaitsPrepayment({ ...base, paymentMethod: "bank" })).toBe(true);
    expect(awaitsPrepayment({ ...base, paymentMethod: "cod" })).toBe(false);
    expect(awaitsPrepayment({ ...base, paymentMethod: "cod", depositAmount: 100_000 })).toBe(true);
    expect(awaitsPrepayment({ ...base, paymentMethod: "bank", paymentStatus: "paid" })).toBe(false);
    expect(prepaymentDeadline({ paymentMethod: "bank", createdAt: 0 })).toBe(48 * HOUR);
    expect(prepaymentDeadline({ paymentMethod: "vnpay", createdAt: 0 })).toBe(24 * HOUR);
  });
});

describe("khách báo đã chuyển khoản", () => {
  it("đơn chuyển khoản: ghi lời báo, hiện ở danh sách chờ (lên đầu); tối đa 3 lần một giờ", async () => {
    const { order: quiet } = await placeOrder("bank");
    const { order } = await placeOrder("bank");
    expect(await claimTransferAction(order.token, "  Chuyển từ VCB lúc 20:15  ")).toMatchObject({ ok: true });
    expect(await transfers.latestClaim(order.id)).toMatchObject({ note: "Chuyển từ VCB lúc 20:15" });
    const list = await transfers.listAwaitingTransfers();
    expect(list[0]).toMatchObject({ id: order.id, claim: { note: "Chuyển từ VCB lúc 20:15" } });
    expect(list.find((item) => item.id === quiet.id)?.claim).toBeNull();
    await claimTransferAction(order.token, "");
    await claimTransferAction(order.token, "");
    expect((await claimTransferAction(order.token, "")).message).toMatch(/đã nhận được báo/);
    for (const item of [quiet, order]) expect(await orders.applyOrderAction(item.id, "customer_cancel")).toBe(true);
  });

  it("đơn COD, đơn đã trả, token sai: không nhận lời báo", async () => {
    const { order: cod } = await placeOrder("cod");
    expect((await claimTransferAction(cod.token, "")).ok).toBeFalsy();
    const { order: paid } = await placeOrder("bank");
    expect(await orders.applyOrderAction(paid.id, "mark_paid")).toBe(true);
    expect((await claimTransferAction(paid.token, "")).ok).toBeFalsy();
    expect((await claimTransferAction("ngan", "")).ok).toBeFalsy();
    expect((await claimTransferAction("x".repeat(32), "")).ok).toBeFalsy();
    for (const item of [cod, paid]) expect(await orders.applyOrderAction(item.id, "cancel")).toBe(true);
  });
});

describe("việc định kỳ", () => {
  it("nhắc một lần sau 24 giờ; không nhắc đơn đã báo chuyển, đơn chưa tới mốc", async () => {
    const { order: due } = await placeOrder("bank", "nhac@example.com");
    const { order: fresh } = await placeOrder("bank", "moi@example.com");
    const { order: claimed } = await placeOrder("bank", "bao@example.com");
    await age(due.id, 25);
    await age(claimed.id, 25);
    await transfers.claimTransfer(claimed.id, "");
    const now = Date.now();
    await transfers.remindUnpaidTransfers(now);
    await transfers.remindUnpaidTransfers(now);
    expect((await mailRefs(due.id)).filter((event) => event === "transfer_reminder")).toHaveLength(1);
    expect(await mailRefs(fresh.id)).not.toContain("transfer_reminder");
    expect(await mailRefs(claimed.id)).not.toContain("transfer_reminder");
    for (const item of [due, fresh, claimed]) expect(await orders.applyOrderAction(item.id, "customer_cancel")).toBe(true);
  });

  it("tự huỷ đơn quá 48 giờ, trả hàng giữ về kho, gửi thư 'expired'; giữ đơn đã báo chuyển và đơn còn hạn", async () => {
    const { product, order: late } = await placeOrder("bank", "tre@example.com", "gundam-exia");
    const { order: claimed } = await placeOrder("bank", "bao2@example.com");
    const { order: recent } = await placeOrder("bank", "kip@example.com");
    const { order: cod } = await placeOrder("cod", "cod@example.com");
    await age(late.id, 49);
    await age(claimed.id, 49);
    await age(recent.id, 47);
    await age(cod.id, 100);
    await transfers.claimTransfer(claimed.id, "đã chuyển");
    const before = await reserved(product.variantId);
    expect(await transfers.expireUnpaidOrders(Date.now())).toEqual([late.code]);
    expect((await orders.findOrderById(late.id))!.status).toBe("cancelled");
    expect(await reserved(product.variantId)).toBe(before - 1);
    expect(await mailRefs(late.id)).toContain("expired");
    expect(await mailRefs(late.id)).not.toContain("cancel");
    for (const item of [claimed, recent, cod]) expect((await orders.findOrderById(item.id))!.status).toBe("pending");
    for (const item of [claimed, recent, cod]) expect(await orders.applyOrderAction(item.id, "customer_cancel")).toBe(true);
  });

  it("VNPay quá 24 giờ thì huỷ, trừ khi khách đang có lượt thanh toán còn hạn", async () => {
    const { order: stale } = await placeOrder("vnpay", "");
    const { order: paying } = await placeOrder("vnpay", "");
    await age(stale.id, 25);
    await age(paying.id, 25);
    const db = await getDb();
    const now = Date.now();
    await db.execute({
      sql: "INSERT INTO payment_attempts (id, order_id, gateway, ref, amount, status, expires_at, created_at, updated_at) VALUES (?, ?, 'vnpay', ?, ?, 'pending', ?, ?, ?)",
      args: ["a".repeat(20), paying.id, `${paying.code}TEST01`, paying.total, now + 10 * 60_000, now, now],
    });
    expect(await transfers.expireUnpaidOrders(now)).toEqual([stale.code]);
    expect(await orders.applyOrderAction(paying.id, "customer_cancel")).toBe(true);
  });

  it("route định kỳ: sai khoá trả 404; đúng khoá chạy và trả kết quả", async () => {
    expect((await cronRoute(new Request("http://localhost/api/cron/dinh-ky"))).status).toBe(404);
    const response = await cronRoute(new Request("http://localhost/api/cron/dinh-ky", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reminded: expect.any(Number), expired: expect.any(Array) });
  });
});
