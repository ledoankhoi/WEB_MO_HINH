import "server-only";
import type { InStatement, Row } from "../db";
import { getDb, isConstraintError } from "../db";
import { auditStatement, type AuditEntry } from "./audit";

// Hoá đơn VAT theo yêu cầu của khách (nghiep-vu-ban-hang mục 17). Khách nhập thông tin công ty lúc đặt hàng; kế toán xuất
// (cấp số hoá đơn nội bộ) cho đơn đã thanh toán rồi in bản hoá đơn. Chưa nối nhà cung cấp hoá đơn điện tử.

export type InvoiceInput = { companyName: string; taxCode: string; companyAddress: string; invoiceEmail: string };
export type OrderInvoice = InvoiceInput & { orderId: string; status: "requested" | "issued"; invoiceNo: string | null; issuedAt: number | null; createdAt: number };

// Mã số thuế doanh nghiệp: 10 số, chi nhánh thêm "-" và 3 số.
export const isTaxCode = (value: string) => /^\d{10}(-\d{3})?$/.test(value);

export function toInvoice(row: Row): OrderInvoice {
  return {
    orderId: String(row.order_id),
    companyName: String(row.company_name),
    taxCode: String(row.tax_code),
    companyAddress: String(row.company_address),
    invoiceEmail: String(row.invoice_email),
    status: row.status === "issued" ? "issued" : "requested",
    invoiceNo: row.invoice_no === null || row.invoice_no === undefined ? null : String(row.invoice_no),
    issuedAt: row.issued_at === null || row.issued_at === undefined ? null : Number(row.issued_at),
    createdAt: Number(row.created_at),
  };
}

// Câu ghi yêu cầu hoá đơn, chạy cùng lô tạo đơn (src/server/repo/orders.ts).
export function invoiceRequestStatement(orderId: string, input: InvoiceInput, now: number): InStatement {
  return {
    sql: `INSERT INTO order_invoices (order_id, company_name, tax_code, company_address, invoice_email, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [orderId, input.companyName, input.taxCode, input.companyAddress, input.invoiceEmail, now],
  };
}

export type IssueResult = { ok: true; invoiceNo: string } | { ok: false; reason: "not_found" | "unpaid" | "issued" };

// Cấp số hoá đơn HDyyyy-nnnnnn (năm theo giờ Việt Nam, đánh số tiếp trong năm) cho đơn đã thanh toán đủ. Hai người bấm cùng
// lúc: một người cấp được, người kia nhận "issued"; trùng số (cực hiếm) thì thử số kế tiếp.
export async function issueInvoice(orderId: string, audit: AuditEntry, now = Date.now()): Promise<IssueResult> {
  const db = await getDb();
  const row = (
    await db.execute({
      sql: "SELECT i.status, o.payment_status FROM order_invoices i JOIN orders o ON o.id = i.order_id WHERE i.order_id = ?",
      args: [orderId],
    })
  ).rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  if (row.status === "issued") return { ok: false, reason: "issued" };
  if (row.payment_status !== "paid") return { ok: false, reason: "unpaid" };
  const year = new Date(now + 7 * 3600 * 1000).getUTCFullYear();
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM order_invoices WHERE invoice_no LIKE ?", args: [`HD${year}-%`] });
    const invoiceNo = `HD${year}-${String(Number(count.rows[0].n) + 1 + attempt).padStart(6, "0")}`;
    try {
      const results = await db.batch([
        {
          sql: "UPDATE order_invoices SET status = 'issued', invoice_no = ?, issued_by = ?, issued_at = ? WHERE order_id = ? AND status = 'requested'",
          args: [invoiceNo, audit.actor.id, now, orderId],
        },
        auditStatement({ ...audit, entityId: orderId, detail: { invoiceNo } }),
      ]);
      return results[0].rowsAffected > 0 ? { ok: true, invoiceNo } : { ok: false, reason: "issued" };
    } catch (error) {
      if (!isConstraintError(error)) throw error;
    }
  }
  throw new Error("Không cấp được số hoá đơn duy nhất");
}

export async function listInvoices(status: "requested" | "issued", limit = 100): Promise<(OrderInvoice & { orderCode: string; total: number; paymentStatus: string })[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT i.*, o.code, o.total, o.payment_status FROM order_invoices i JOIN orders o ON o.id = i.order_id
          WHERE i.status = ? ORDER BY ${status === "issued" ? "i.issued_at DESC" : "i.created_at"} LIMIT ?`,
    args: [status, limit],
  });
  return result.rows.map((row) => ({ ...toInvoice(row), orderCode: String(row.code), total: Number(row.total), paymentStatus: String(row.payment_status) }));
}

// Tách tiền hàng và thuế từ số đã gồm VAT (làm tròn tới đồng): tiền thuế = tổng − tổng / (1 + thuế suất).
export function splitVat(totalWithVat: number, vatPercent: number): { beforeVat: number; vat: number } {
  const beforeVat = Math.round((totalWithVat * 100) / (100 + vatPercent));
  return { beforeVat, vat: totalWithVat - beforeVat };
}
