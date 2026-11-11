import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Trả hàng sau khi nhận (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 4).

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (options: string | { name: string }) => jar.delete(typeof options === "string" ? options : options.name),
  }),
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-for": "10.0.0.9" }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const inventory = await import("@/server/repo/inventory");
const returns = await import("@/server/repo/returns");
const documents = await import("@/server/repo/stock-documents");
const actions = await import("@/app/actions/returns");
const { POST } = await import("@/app/api/don-hang/[token]/tra-hang/route");
const { suggestedRefund, validatePicks, returnDeadline, DAY_MS, RETURN_DAYS } = await import("@/lib/returns");

const staff = { order: "", warehouse: "", accountant: "" };

// Đơn COD đã đi hết luồng: xác nhận → đóng gói → bàn giao → giao thành công → thu tiền (tự hoàn tất).
async function deliveredOrder(slug = "gundam-exia", quantity = 2) {
  const product = (await products.findProductBySlug(slug))!;
  const created = await orders.createOrder({
    userId: null,
    paymentMethod: "cod",
    customerName: "Khách Trả",
    customerPhone: "0901234567",
    customerEmail: "khach-tra@example.com",
    shippingAddress: "12 Lê Lợi",
    shippingCity: "Đà Nẵng",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không tạo được đơn");
  const id = created.order.id;
  for (const key of ["confirm", "start_packing", "packed"] as const) expect(await orders.applyOrderAction(id, key)).toBe(true);
  expect(await orders.applyOrderAction(id, "hand_over", undefined, { tracking: { carrier: "GHN", code: "GHN12345" } })).toBe(true);
  expect(await orders.applyOrderAction(id, "delivered")).toBe(true);
  expect(await orders.applyOrderAction(id, "mark_paid")).toBe(true);
  const order = (await orders.findOrderById(id))!;
  expect(order.status).toBe("completed");
  return { product, order };
}

function submit(token: string, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return POST(new Request(`http://localhost:3000/api/don-hang/${token}/tra-hang`, { method: "POST", body: form }), {
    params: Promise.resolve({ token }),
  });
}

const ACCOUNT = "Vietcombank 0123456789 NGUYEN VAN A";

async function mails(kind: string) {
  const db = await getDb();
  return (await db.execute({ sql: "SELECT ref, subject FROM email_outbox WHERE kind = ? ORDER BY created_at", args: [kind] })).rows;
}

beforeAll(async () => {
  await getDb();
  staff.order = (await createUser("order_staff")).id;
  staff.warehouse = (await createUser("warehouse_manager")).id;
  staff.accountant = (await createUser("accountant")).id;
});
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
  const db = await getDb();
  await db.execute("DELETE FROM rate_limits");
});
afterAll(cleanup);

describe("phép tính thuần", () => {
  const order = { subtotal: 1_000_000, discount: 100_000, total: 930_000, items: [{ lineId: 1, unitPrice: 400_000, quantity: 1 }, { lineId: 2, unitPrice: 300_000, quantity: 2 }] };

  it("tiền hoàn = giá trị hàng trả − phần giảm giá theo tỉ lệ, không gồm phí giao", () => {
    expect(suggestedRefund(order, new Map([[1, 1]]))).toBe(360_000);
    expect(suggestedRefund(order, new Map([[2, 1]]))).toBe(270_000);
    // Trả hết: 1.000.000 − 100.000 = 900.000 (phí giao 30.000 không hoàn).
    expect(suggestedRefund(order, new Map([[1, 1], [2, 2]]))).toBe(900_000);
    expect(suggestedRefund(order, new Map())).toBe(0);
  });

  it("kiểm tra dòng và số lượng khách chọn", () => {
    expect(validatePicks(order.items, new Map())).toMatch(/ít nhất/);
    expect(validatePicks(order.items, new Map([[9, 1]]))).toMatch(/không thuộc/);
    expect(validatePicks(order.items, new Map([[2, 3]]))).toMatch(/không hợp lệ/);
    expect(validatePicks(order.items, new Map([[2, 1.5]]))).toMatch(/không hợp lệ/);
    expect(validatePicks(order.items, new Map([[2, 2]]))).toBeNull();
  });

  it("hạn trả hàng tính từ lúc giao", () => {
    expect(returnDeadline(1000)).toBe(1000 + RETURN_DAYS * DAY_MS);
  });
});

describe("luồng trả hàng", () => {
  it("chưa giao thì không gửi được", async () => {
    const product = (await products.findProductBySlug("chars-zaku-ii"))!;
    const created = await orders.createOrder({
      userId: null, paymentMethod: "cod", customerName: "A", customerPhone: "0901234567", customerEmail: "", shippingAddress: "x", shippingCity: "Huế", note: "", idempotencyKey: null,
      items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
    });
    if (!created.ok) throw new Error("không tạo được đơn");
    const saved = (await orders.findOrderById(created.order.id))!;
    const response = await submit(saved.token, { reason: "changed_mind", account: ACCOUNT, [`qty-${saved.items[0].lineId}`]: "1" });
    expect(response.status).toBe(409);
    expect(await orders.applyOrderAction(created.order.id, "customer_cancel")).toBe(true);
  });

  it("kiểm tra dữ liệu: lý do cần ảnh, tài khoản nhận tiền, số lượng", async () => {
    const { order } = await deliveredOrder();
    const line = `qty-${order.items[0].lineId}`;
    const noPhoto = await (await submit(order.token, { reason: "defective", note: "Gãy khớp vai trái khi mở hộp", account: ACCOUNT, [line]: "1" })).json();
    expect(noPhoto.errors.images).toMatch(/ảnh/);
    const tooMany = await (await submit(order.token, { reason: "changed_mind", account: ACCOUNT, [line]: "3" })).json();
    expect(tooMany.errors.items).toBeTruthy();
    const noAccount = await (await submit(order.token, { reason: "changed_mind", account: "", [line]: "1" })).json();
    expect(noAccount.errors.account).toBeTruthy();
    expect((await returns.listReturnsForOrder(order.id)).length).toBe(0);
  });

  it("quá hạn 7 ngày thì không gửi được", async () => {
    const { order } = await deliveredOrder();
    const db = await getDb();
    await db.execute({
      sql: "UPDATE order_events SET created_at = created_at - ? WHERE order_id = ? AND field = 'shipping_status' AND to_value = 'delivered'",
      args: [(RETURN_DAYS + 1) * DAY_MS, order.id],
    });
    const response = await submit(order.token, { reason: "changed_mind", account: ACCOUNT, [`qty-${order.items[0].lineId}`]: "1" });
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/quá hạn/);
  });

  it("gửi → duyệt → lập phiếu → ghi sổ → hoàn tiền; một phần đơn thì đơn vẫn 'đã thanh toán'", async () => {
    const { product, order } = await deliveredOrder("gundam-exia", 2);
    const before = await inventory.findInventoryDiscrepancies();
    expect(before).toEqual([]);
    const response = await submit(order.token, { reason: "changed_mind", note: "", account: ACCOUNT, [`qty-${order.items[0].lineId}`]: "1" });
    expect(response.status).toBe(200);
    const [request] = await returns.listReturnsForOrder(order.id);
    expect(request).toMatchObject({ status: "requested", code: `TH-${order.code}`, refundAmount: product.price, refundAccount: ACCOUNT });
    expect(request.items).toEqual([expect.objectContaining({ variantId: product.variantId, quantity: 1 })]);

    // Gửi lần hai khi đã có yêu cầu mở: bị chặn.
    expect((await submit(order.token, { reason: "changed_mind", account: ACCOUNT, [`qty-${order.items[0].lineId}`]: "1" })).status).toBe(409);

    // Sai quyền: kế toán không duyệt được.
    await signInAs(staff.accountant);
    expect((await actions.decideReturnAction(request.id, true, { amount: product.price })).ok).toBeFalsy();
    await signInAs(staff.order);
    expect((await actions.decideReturnAction(request.id, true, { amount: order.total + 1 })).message).toMatch(/Số tiền hoàn/);
    expect((await actions.decideReturnAction(request.id, true, { amount: product.price, note: "Gửi kèm hộp" })).ok).toBe(true);
    // Hoàn tiền trước khi hàng về: bị chặn.
    await signInAs(staff.accountant);
    expect((await actions.refundReturnAction(request.id, "")).message).toMatch(/chưa ghi sổ/);

    await signInAs(staff.warehouse);
    const doc = await actions.createReturnDocumentAction(request.id);
    expect(doc.ok).toBe(true);
    expect((await actions.createReturnDocumentAction(request.id)).ok).toBeFalsy();
    const document = (await documents.findDocument(doc.documentId!))!;
    expect(document).toMatchObject({ type: "return", orderId: order.id, reference: request.code });
    expect(document.lines).toEqual([expect.objectContaining({ variantId: product.variantId, qty: 1 })]);
    const posted = await documents.postDocument(document.id, { actor: { id: staff.warehouse, role: "warehouse_manager" }, action: "stock_document.post", entity: "stock_document", summary: "test" });
    expect(posted).toEqual({ ok: true });
    const db = await getDb();
    const back = (await db.execute({
      sql: "SELECT SUM(m.qty_delta) AS n FROM stock_movements m JOIN locations l ON l.id = m.location_id WHERE m.order_id = ? AND m.type = 'return_in' AND l.type = 'quarantine'",
      args: [order.id],
    })).rows[0];
    expect(Number(back.n)).toBe(1);

    await signInAs(staff.accountant);
    expect((await actions.refundReturnAction(request.id, "FT2611080001")).ok).toBe(true);
    expect((await actions.refundReturnAction(request.id, "FT2611080001")).ok).toBeFalsy();
    const after = (await orders.findOrderById(order.id))!;
    expect(after.payments.filter((p) => p.kind === "refund")).toEqual([expect.objectContaining({ amount: product.price, reference: "FT2611080001" })]);
    expect(after.paymentStatus).toBe("paid");
    expect((await returns.findReturnRequest(request.id))!.status).toBe("refunded");
    const audit = (await db.execute({ sql: "SELECT action FROM audit_logs WHERE action LIKE 'return.%' ORDER BY id" })).rows.map((row) => row.action);
    expect(audit).toEqual(expect.arrayContaining(["return.approve", "return.refund"]));
    expect((await mails("return")).map((row) => String(row.ref).split(":")[1])).toEqual(["requested", "approved", "refunded"]);
  });

  it("trả hết và hoàn đủ tổng đơn thì đơn chuyển 'đã hoàn tiền'", async () => {
    const { order } = await deliveredOrder("gundam-exia", 1);
    expect((await submit(order.token, { reason: "changed_mind", account: ACCOUNT, [`qty-${order.items[0].lineId}`]: "1" })).status).toBe(200);
    const [request] = await returns.listReturnsForOrder(order.id);
    await signInAs(staff.order);
    expect((await actions.decideReturnAction(request.id, true, { amount: order.total, note: "Hoàn cả phí giao" })).ok).toBe(true);
    await signInAs(staff.warehouse);
    const doc = await actions.createReturnDocumentAction(request.id);
    expect((await documents.postDocument(doc.documentId!, { actor: { id: staff.warehouse, role: "warehouse_manager" }, action: "x", entity: "stock_document", summary: "x" })).ok).toBe(true);
    await signInAs(staff.accountant);
    expect((await actions.refundReturnAction(request.id, "")).ok).toBe(true);
    expect((await orders.findOrderById(order.id))!.paymentStatus).toBe("refunded");
  });

  it("từ chối cần lý do; bị từ chối thì khách gửi lại được, khách tự huỷ khi còn chờ duyệt", async () => {
    const { order } = await deliveredOrder("chars-zaku-ii", 1);
    const fields = { reason: "changed_mind", account: ACCOUNT, [`qty-${order.items[0].lineId}`]: "1" };
    expect((await submit(order.token, fields)).status).toBe(200);
    const [first] = await returns.listReturnsForOrder(order.id);
    await signInAs(staff.order);
    expect((await actions.decideReturnAction(first.id, false, { note: "" })).ok).toBeFalsy();
    expect((await actions.decideReturnAction(first.id, false, { note: "Hộp đã bóc seal" })).ok).toBe(true);
    expect((await submit(order.token, fields)).status).toBe(200);
    const [second] = await returns.listReturnsForOrder(order.id);
    expect(second.code).toBe(`TH-${order.code}-2`);
    expect((await actions.cancelReturnAction("x".repeat(32), second.id)).ok).toBeFalsy();
    expect((await actions.cancelReturnAction(order.token, second.id)).ok).toBe(true);
    expect((await returns.findReturnRequest(second.id))!.status).toBe("cancelled");
  });
});
