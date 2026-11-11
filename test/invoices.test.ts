import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const invoices = await import("@/server/repo/invoices");
const orders = await import("@/server/repo/orders");
const products = await import("@/server/repo/products");

let audit: Parameters<typeof invoices.issueInvoice>[1];
beforeAll(async () => {
  await getDb();
  const user = await createUser("accountant");
  audit = { actor: { id: user.id, role: "accountant" }, action: "test", entity: "orders", summary: "test" };
});
afterAll(cleanup);

const company = { companyName: "Công ty TNHH Robot Việt", taxCode: "0312345678", companyAddress: "1 Lê Lợi, Huế", invoiceEmail: "ketoan@robotviet.vn" };

async function place(withInvoice: boolean) {
  const product = (await products.findProductBySlug("bruticus"))!;
  const created = await orders.createOrder({
    userId: null,
    paymentMethod: "bank",
    customerName: "Khách công ty",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "1 Lê Lợi",
    shippingCity: "Huế",
    note: "",
    idempotencyKey: null,
    invoice: withInvoice ? company : undefined,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không đặt được");
  return created.order.id;
}

describe("hoá đơn VAT", () => {
  it("kiểm mã số thuế, tách thuế từ giá đã gồm VAT", () => {
    expect(invoices.isTaxCode("0312345678")).toBe(true);
    expect(invoices.isTaxCode("0312345678-001")).toBe(true);
    expect(invoices.isTaxCode("031234567")).toBe(false);
    expect(invoices.splitVat(1_100_000, 10)).toEqual({ beforeVat: 1_000_000, vat: 100_000 });
    const { beforeVat, vat } = invoices.splitVat(999_999, 8);
    expect(beforeVat + vat).toBe(999_999);
  });

  it("yêu cầu đi cùng đơn; chỉ xuất khi đã thanh toán; số hoá đơn tăng dần, không xuất hai lần", async () => {
    const id = await place(true);
    expect((await orders.findOrderById(id))!.invoice).toMatchObject({ ...company, status: "requested", invoiceNo: null });
    expect(await invoices.issueInvoice(id, audit)).toEqual({ ok: false, reason: "unpaid" });
    expect(await orders.applyOrderAction(id, "mark_paid")).toBe(true);
    const first = await invoices.issueInvoice(id, audit, Date.UTC(2026, 10, 8));
    expect(first).toEqual({ ok: true, invoiceNo: "HD2026-000001" });
    expect(await invoices.issueInvoice(id, audit)).toEqual({ ok: false, reason: "issued" });

    const second = await place(true);
    await orders.applyOrderAction(second, "mark_paid");
    expect(await invoices.issueInvoice(second, audit, Date.UTC(2026, 10, 9))).toEqual({ ok: true, invoiceNo: "HD2026-000002" });
    expect((await invoices.listInvoices("issued")).map((i) => i.invoiceNo)).toEqual(["HD2026-000002", "HD2026-000001"]);

    const none = await place(false);
    expect((await orders.findOrderById(none))!.invoice).toBeNull();
    expect(await invoices.issueInvoice(none, audit)).toEqual({ ok: false, reason: "not_found" });
  });
});
