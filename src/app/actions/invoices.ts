"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { issueInvoice } from "@/server/repo/invoices";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Kế toán cấp số hoá đơn VAT cho đơn đã thanh toán (nghiep-vu-ban-hang mục 17), quyền payments.manage.
export async function issueInvoiceAction(orderId: string): Promise<FormState> {
  const audit = await staffWith("payments.manage");
  if (!audit) return FORBIDDEN;
  if (!isId(orderId)) return { message: "Yêu cầu không hợp lệ." };
  const result = await issueInvoice(orderId, audit({ action: "invoice.issue", entity: "orders", summary: "Xuất hoá đơn VAT" }));
  if (!result.ok) {
    return {
      message:
        result.reason === "unpaid" ? "Đơn chưa thanh toán đủ nên chưa xuất hoá đơn được." : result.reason === "issued" ? "Hoá đơn đã được xuất trước đó." : "Đơn không có yêu cầu hoá đơn.",
    };
  }
  refresh();
  return { ok: true, message: `Đã cấp số hoá đơn ${result.invoiceNo}.` };
}
