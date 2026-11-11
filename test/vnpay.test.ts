import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Thanh toán VNPay sandbox (docs/ke-hoach/thanh-toan-va-van-chuyen.md mục 4).

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": "10.0.0.7" }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const SECRET = "SANDBOXSECRETKEY0123456789ABCDEF";
process.env.VNPAY_TMN_CODE = "TESTCODE";
process.env.VNPAY_HASH_SECRET = SECRET;

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const inventory = await import("@/server/repo/inventory");
const attempts = await import("@/server/repo/payment-attempts");
const vnpay = await import("@/server/payments/vnpay");
const { handleIpn, handleReturn } = await import("@/server/payments/vnpay-settle");
const { startVnpayPayment } = await import("@/server/payments/checkout");
const { getPaymentMethods } = await import("@/server/payment");
const { payAgainAction } = await import("@/app/actions/orders");

async function vnpayOrder(slug = "gundam-exia") {
  const product = (await products.findProductBySlug(slug))!;
  const created = await orders.createOrder({
    userId: null, paymentMethod: "vnpay", customerName: "Khách VNPay", customerPhone: "0901234567", customerEmail: "vnpay@example.com",
    shippingAddress: "12 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  return (await orders.findOrderById(created.order.id))!;
}

// URL VNPay gọi về: tham số kết quả kèm chữ ký đúng (hoặc sửa sau khi ký để thử giả mạo).
function callback(path: string, fields: Record<string, string>, tamper?: (params: Record<string, string>) => void) {
  const params: Record<string, string> = { vnp_TmnCode: "TESTCODE", vnp_BankCode: "NCB", vnp_TransactionNo: "14567890", vnp_PayDate: "20261108120000", ...fields };
  params.vnp_SecureHash = vnpay.sign(params, SECRET);
  tamper?.(params);
  return new URL(`http://localhost:3000${path}?${new URLSearchParams(params)}`);
}
const paidFields = (ref: string, amount: number) => ({ vnp_TxnRef: ref, vnp_Amount: String(amount * 100), vnp_ResponseCode: "00", vnp_TransactionStatus: "00" });

async function startAttempt(order: { id: string; code: string; total: number }) {
  const url = new URL((await startVnpayPayment(order, "10.0.0.7"))!);
  return { url, ref: url.searchParams.get("vnp_TxnRef")! };
}

beforeAll(async () => {
  await getDb();
});
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
  const db = await getDb();
  await db.execute("DELETE FROM rate_limits");
});
afterAll(cleanup);

describe("ký và kiểm chữ ký", () => {
  it("mã hoá như urlencode của PHP và sắp xếp theo tên tham số", () => {
    expect(vnpay.phpUrlencode("Thanh toan don A*B (1)")).toBe("Thanh+toan+don+A%2AB+%281%29");
    expect(vnpay.hashData({ vnp_B: "2", vnp_A: "x y", vnp_SecureHash: "bo", other: "bo", vnp_Empty: "" })).toBe("vnp_A=x+y&vnp_B=2");
  });

  it("chữ ký HMAC-SHA512 128 ký tự hex; sửa một tham số thì không khớp", () => {
    const params = { vnp_Amount: "100000", vnp_TxnRef: "ABC123" };
    const signed = { ...params, vnp_SecureHash: vnpay.sign(params, SECRET) };
    expect(signed.vnp_SecureHash).toMatch(/^[0-9a-f]{128}$/);
    expect(vnpay.verifySignature(signed, SECRET)).toBe(true);
    expect(vnpay.verifySignature({ ...signed, vnp_Amount: "1" }, SECRET)).toBe(false);
    expect(vnpay.verifySignature(signed, "khoa-khac-0123456789")).toBe(false);
    expect(vnpay.verifySignature({ ...params, vnp_SecureHash: "abc" }, SECRET)).toBe(false);
  });

  it("giờ GMT+7, thông tin đơn không dấu", () => {
    expect(vnpay.vnpDate(Date.UTC(2026, 10, 8, 17, 30, 5))).toBe("20261109003005");
    expect(vnpay.plainInfo("Thanh toán đơn #RB12 — Đà Nẵng")).toBe("Thanh toan don RB12 Da Nang");
  });

  it("chỉ coi là đã cấu hình khi đủ mã và khoá; mặc định là sandbox", () => {
    expect(vnpay.vnpayConfig({ VNPAY_TMN_CODE: "TESTCODE" })).toBeNull();
    expect(vnpay.vnpayConfig({ VNPAY_TMN_CODE: "TESTCODE", VNPAY_HASH_SECRET: SECRET })).toMatchObject({ sandbox: true, payUrl: vnpay.SANDBOX_PAY_URL });
    expect(getPaymentMethods()).toContain("vnpay");
  });
});

describe("luồng thanh toán", () => {
  it("URL thanh toán: đúng tham số, số tiền × 100, hạn 15 phút, ký đúng", async () => {
    const order = await vnpayOrder();
    const { url, ref } = await startAttempt(order);
    expect(`${url.origin}${url.pathname}`).toBe(vnpay.SANDBOX_PAY_URL);
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({ vnp_Version: "2.1.0", vnp_Command: "pay", vnp_TmnCode: "TESTCODE", vnp_Amount: String(order.total * 100), vnp_CurrCode: "VND", vnp_IpAddr: "10.0.0.7" });
    expect(params.vnp_ReturnUrl).toBe("http://localhost:3000/api/thanh-toan/vnpay/tra-ve");
    const ms = (v: string) => Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(8, 10), +v.slice(10, 12), +v.slice(12, 14));
    expect(ms(params.vnp_ExpireDate) - ms(params.vnp_CreateDate)).toBe(15 * 60 * 1000);
    expect(vnpay.verifySignature(params, SECRET)).toBe(true);
    expect(ref.startsWith(order.code)).toBe(true);
    expect((await attempts.findAttempt(ref))).toMatchObject({ status: "pending", amount: order.total });
  });

  it("IPN thành công: đơn chuyển đã thanh toán, ghi payments, gọi lặp trả 02", async () => {
    const order = await vnpayOrder();
    const { ref } = await startAttempt(order);
    expect(await handleIpn(callback("/api/thanh-toan/vnpay/ipn", paidFields(ref, order.total)))).toEqual({ RspCode: "00", Message: "Confirm Success" });
    const paid = (await orders.findOrderById(order.id))!;
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.payments).toEqual([expect.objectContaining({ kind: "charge", amount: order.total })]);
    expect((await attempts.findAttempt(ref))!.status).toBe("paid");
    expect((await handleIpn(callback("/api/thanh-toan/vnpay/ipn", paidFields(ref, order.total)))).RspCode).toBe("02");
    const db = await getDb();
    const charge = (await db.execute({ sql: "SELECT gateway_txn, method FROM payments WHERE order_id = ?", args: [order.id] })).rows[0];
    expect(charge).toMatchObject({ gateway_txn: "14567890", method: "vnpay" });
    const logged = (await db.execute({ sql: "SELECT kind, signature_ok, result FROM payment_callbacks WHERE ref = ? ORDER BY id", args: [ref] })).rows;
    expect(logged.map((row) => row.result)).toEqual(["00", "02"]);
  });

  it("IPN sai chữ ký (97), không thấy mã (01), sai số tiền (04): không đổi đơn", async () => {
    const order = await vnpayOrder();
    const { ref } = await startAttempt(order);
    const forged = callback("/api/thanh-toan/vnpay/ipn", paidFields(ref, order.total), (params) => { params.vnp_Amount = "100"; });
    expect((await handleIpn(forged)).RspCode).toBe("97");
    expect((await handleIpn(callback("/api/thanh-toan/vnpay/ipn", paidFields("KHONGCO123", order.total)))).RspCode).toBe("01");
    expect((await handleIpn(callback("/api/thanh-toan/vnpay/ipn", paidFields(ref, order.total - 1000)))).RspCode).toBe("04");
    expect((await orders.findOrderById(order.id))!.paymentStatus).toBe("unpaid");
  });

  it("khách huỷ (24): lượt thất bại, đơn vẫn chờ; thanh toán lại tạo mã mới", async () => {
    const order = await vnpayOrder();
    const { ref } = await startAttempt(order);
    const failed = { vnp_TxnRef: ref, vnp_Amount: String(order.total * 100), vnp_ResponseCode: "24", vnp_TransactionStatus: "02" };
    expect((await handleIpn(callback("/api/thanh-toan/vnpay/ipn", failed))).RspCode).toBe("00");
    expect((await attempts.findAttempt(ref))).toMatchObject({ status: "failed", responseCode: "24" });
    const again = await payAgainAction(order.token);
    expect(again.payUrl).toBeTruthy();
    const second = new URL(again.payUrl!).searchParams.get("vnp_TxnRef");
    expect(second).not.toBe(ref);
    expect(await handleReturn(callback("/api/thanh-toan/vnpay/tra-ve", failed), "10.0.0.7")).toMatchObject({ status: "failed", responseCode: "24" });
  });

  it("trang trả về không tin URL: chỉ ghi nhận sau khi tra cứu (querydr) xác nhận", async () => {
    const order = await vnpayOrder();
    const { ref } = await startAttempt(order);
    const url = callback("/api/thanh-toan/vnpay/tra-ve", paidFields(ref, order.total));
    // VNPay tra cứu báo chưa thành công: không ghi.
    const notYet = vi.fn(async () => Response.json({ vnp_TxnRef: ref, vnp_ResponseCode: "00", vnp_TransactionStatus: "01", vnp_Amount: String(order.total * 100) }));
    expect((await handleReturn(url, "10.0.0.7", notYet as unknown as typeof fetch)).status).toBe("pending");
    expect((await orders.findOrderById(order.id))!.paymentStatus).toBe("unpaid");
    const body = JSON.parse(String((notYet.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ vnp_Command: "querydr", vnp_TxnRef: ref, vnp_TmnCode: "TESTCODE" });
    expect(body.vnp_SecureHash).toMatch(/^[0-9a-f]{128}$/);
    // Tra cứu xác nhận thành công: ghi nhận.
    const ok = vi.fn(async () => Response.json({ vnp_TxnRef: ref, vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_Amount: String(order.total * 100), vnp_TransactionNo: "999" }));
    expect((await handleReturn(url, "10.0.0.7", ok as unknown as typeof fetch)).status).toBe("paid");
    expect((await orders.findOrderById(order.id))!.paymentStatus).toBe("paid");
    // Sửa URL trả về: không hợp lệ.
    const forged = callback("/api/thanh-toan/vnpay/tra-ve", paidFields(ref, order.total), (params) => { params.vnp_ResponseCode = "24"; });
    expect((await handleReturn(forged, "10.0.0.7")).status).toBe("invalid");
  });

  it("tiền về sau khi đơn đã huỷ: vẫn ghi nhận để chờ hoàn tiền (L14)", async () => {
    const order = await vnpayOrder("chars-zaku-ii");
    const { ref } = await startAttempt(order);
    expect(await orders.applyOrderAction(order.id, "customer_cancel")).toBe(true);
    expect((await handleIpn(callback("/api/thanh-toan/vnpay/ipn", paidFields(ref, order.total)))).RspCode).toBe("00");
    const after = (await orders.findOrderById(order.id))!;
    expect(after).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    expect(await orders.applyOrderAction(order.id, "refund")).toBe(true);
  });

  it("đơn VNPay chưa trả thì chưa xác nhận được (L3)", async () => {
    const order = await vnpayOrder("chars-zaku-ii");
    expect(await orders.applyOrderAction(order.id, "confirm")).toBe(false);
    expect(await orders.applyOrderAction(order.id, "customer_cancel")).toBe(true);
    expect((await payAgainAction(order.token)).payUrl).toBeUndefined();
  });
});
