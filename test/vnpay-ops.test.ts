import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Hoàn tiền qua API và đối soát lượt treo của VNPay (bước C6, C7). Máy chủ VNPay được giả lập bằng fetch giả.

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": "10.0.0.7" }),
}));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const SECRET = "SANDBOXSECRETKEY0123456789ABCDEF";
process.env.VNPAY_TMN_CODE = "TESTCODE";
process.env.VNPAY_HASH_SECRET = SECRET;
process.env.CRON_SECRET = "cron-secret-0123456789";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const attempts = await import("@/server/repo/payment-attempts");
const vnpay = await import("@/server/payments/vnpay");
const ops = await import("@/server/payments/vnpay-ops");
const { startVnpayPayment } = await import("@/server/payments/checkout");
const { GET: reconcileRoute } = await import("@/app/api/thanh-toan/vnpay/doi-soat/route");

type Call = { url: string; body: Record<string, string> };
// fetch giả: ghi lại yêu cầu, trả lời theo hàm `reply`.
function fakeVnpay(reply: (body: Record<string, string>) => Record<string, string>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    calls.push({ url, body });
    return Response.json(reply(body));
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

async function paidVnpayOrder(slug = "gundam-exia") {
  const product = (await products.findProductBySlug(slug))!;
  const created = await orders.createOrder({
    userId: null, paymentMethod: "vnpay", customerName: "Khách", customerPhone: "0901234567", customerEmail: "", shippingAddress: "1 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  const order = (await orders.findOrderById(created.order.id))!;
  const ref = new URL((await startVnpayPayment(order, "10.0.0.7"))!).searchParams.get("vnp_TxnRef")!;
  expect(await attempts.confirmPaid(ref, { amount: order.total, gatewayTxn: "14000001", bankCode: "NCB", responseCode: "00" })).toBe("confirmed");
  return { order, ref };
}

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("chia số tiền hoàn cho các lượt đã trả", () => {
  it("lượt mới nhất trước; toàn phần chỉ khi hoàn hết lượt chưa từng hoàn", () => {
    const paid = [{ ref: "B", amount: 700, refunded: 0 }, { ref: "A", amount: 300, refunded: 0 }];
    expect(ops.planRefund(paid, 1000)).toEqual([{ ref: "B", amount: 700, full: true }, { ref: "A", amount: 300, full: true }]);
    expect(ops.planRefund(paid, 200)).toEqual([{ ref: "B", amount: 200, full: false }]);
    expect(ops.planRefund([{ ref: "B", amount: 700, refunded: 200 }], 500)).toEqual([{ ref: "B", amount: 500, full: false }]);
    expect(ops.planRefund(paid, 1001)).toBeNull();
  });
});

describe("hoàn tiền qua API", () => {
  it("gửi đúng tham số và chữ ký; ghi nhật ký; không cho hoàn quá số đã trả", async () => {
    const { order, ref } = await paidVnpayOrder();
    const { fetcher, calls } = fakeVnpay((body) => ({ vnp_TxnRef: body.vnp_TxnRef, vnp_ResponseCode: "00", vnp_TransactionNo: "14000002" }));
    expect(await ops.vnpayRefundable(order.id)).toBe(order.total);
    const part = 100_000;
    expect(await ops.refundOrderViaVnpay(order.id, part, { name: "Kế toán Ánh", ipAddr: "10.0.0.7" }, fetcher)).toEqual({ ok: true, refunded: part });
    const body = calls[0].body;
    expect(calls[0].url).toBe(vnpay.SANDBOX_API_URL);
    expect(body).toMatchObject({ vnp_Command: "refund", vnp_TransactionType: "03", vnp_TxnRef: ref, vnp_Amount: String(part * 100), vnp_TransactionNo: "14000001", vnp_CreateBy: "Ke toan Anh" });
    const data = [body.vnp_RequestId, body.vnp_Version, body.vnp_Command, body.vnp_TmnCode, body.vnp_TransactionType, body.vnp_TxnRef, body.vnp_Amount,
      body.vnp_TransactionNo, body.vnp_TransactionDate, body.vnp_CreateBy, body.vnp_CreateDate, body.vnp_IpAddr, body.vnp_OrderInfo].join("|");
    expect(body.vnp_SecureHash).toBe(vnpay.hmacSha512(SECRET, data));
    expect(await ops.vnpayRefundable(order.id)).toBe(order.total - part);
    // Đã hoàn một phần: lần sau là "một phần" (03) dù hoàn hết phần còn lại.
    await ops.refundOrderViaVnpay(order.id, order.total - part, { name: "KT", ipAddr: "" }, fetcher);
    expect(calls[1].body.vnp_TransactionType).toBe("03");
    expect(await ops.vnpayRefundable(order.id)).toBe(0);
    expect((await ops.refundOrderViaVnpay(order.id, 1, { name: "KT", ipAddr: "" }, fetcher)).ok).toBe(false);
  });

  it("VNPay từ chối hoặc không trả lời: báo lỗi, không tính là đã hoàn", async () => {
    const { order } = await paidVnpayOrder("chars-zaku-ii");
    const rejected = fakeVnpay((body) => ({ vnp_TxnRef: body.vnp_TxnRef, vnp_ResponseCode: "95" }));
    expect(await ops.refundOrderViaVnpay(order.id, order.total, { name: "KT", ipAddr: "" }, rejected.fetcher)).toEqual({ ok: false, refunded: 0, message: "VNPay: VNPay từ chối xử lý yêu cầu hoàn." });
    expect(rejected.calls[0].body.vnp_TransactionType).toBe("02");
    const down = (async () => { throw new Error("mạng lỗi"); }) as unknown as typeof fetch;
    expect((await ops.refundOrderViaVnpay(order.id, order.total, { name: "KT", ipAddr: "" }, down)).ok).toBe(false);
    expect(await ops.vnpayRefundable(order.id)).toBe(order.total);
  });
});

describe("đối soát lượt treo", () => {
  it("lượt quá hạn: VNPay báo đã trả thì ghi nhận, báo lỗi thì đánh dấu thất bại, chưa rõ thì để lần sau", async () => {
    const make = async (slug: string) => {
      const product = (await products.findProductBySlug(slug))!;
      const created = await orders.createOrder({
        userId: null, paymentMethod: "vnpay", customerName: "Khách", customerPhone: "0901234567", customerEmail: "", shippingAddress: "1 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null,
        items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
      });
      if (!created.ok) throw new Error("không tạo được đơn");
      const order = (await orders.findOrderById(created.order.id))!;
      return { order, ref: new URL((await startVnpayPayment(order, "10.0.0.7"))!).searchParams.get("vnp_TxnRef")! };
    };
    const paid = await make("gundam-exia");
    const failed = await make("chars-zaku-ii");
    const unknown = await make("chars-zaku-ii");
    const db = await getDb();
    // Đẩy lùi thời gian để ba lượt đã quá hạn thanh toán.
    await db.execute({ sql: "UPDATE payment_attempts SET created_at = created_at - ?, expires_at = expires_at - ? WHERE ref IN (?, ?, ?)", args: [3_600_000, 3_600_000, paid.ref, failed.ref, unknown.ref] });
    const { fetcher } = fakeVnpay((body): Record<string, string> => {
      const total = body.vnp_TxnRef === paid.ref ? paid.order.total : 0;
      if (body.vnp_TxnRef === paid.ref) return { vnp_TxnRef: body.vnp_TxnRef, vnp_ResponseCode: "00", vnp_TransactionStatus: "00", vnp_Amount: String(total * 100), vnp_TransactionNo: "777" };
      if (body.vnp_TxnRef === failed.ref) return { vnp_TxnRef: body.vnp_TxnRef, vnp_ResponseCode: "91" };
      return { vnp_TxnRef: body.vnp_TxnRef, vnp_ResponseCode: "00", vnp_TransactionStatus: "01" };
    });
    const result = await ops.reconcilePendingVnpay(Date.now(), fetcher);
    expect(result).toMatchObject({ paid: 1, failed: 1 });
    expect((await orders.findOrderById(paid.order.id))!.paymentStatus).toBe("paid");
    expect((await attempts.findAttempt(failed.ref))!.status).toBe("failed");
    expect((await attempts.findAttempt(unknown.ref))!.status).toBe("pending");
    for (const item of [failed, unknown]) expect(await orders.applyOrderAction(item.order.id, "customer_cancel")).toBe(true);
  });

  it("route đối soát chỉ chạy khi đúng CRON_SECRET", async () => {
    expect((await reconcileRoute(new Request("http://localhost/api/thanh-toan/vnpay/doi-soat"))).status).toBe(404);
    expect((await reconcileRoute(new Request("http://localhost/api/thanh-toan/vnpay/doi-soat", { headers: { Authorization: "Bearer sai-khoa-0123456789" } }))).status).toBe(404);
  });
});
