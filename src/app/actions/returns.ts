"use server";

import { refresh } from "next/cache";
import { formatVnd } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { notifyReturnEvent } from "@/server/email/return-mails";
import { findOrderByToken } from "@/server/repo/orders";
import {
  cancelReturnRequest,
  createReturnDocument,
  decideReturnRequest,
  findReturnRequest,
  recordReturnRefund,
} from "@/server/repo/returns";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Trả hàng (nghiep-vu-ban-hang mục 4). Khách gửi yêu cầu qua POST /api/don-hang/[token]/tra-hang (có ảnh);
// các thao tác còn lại ở đây.

const INVALID: FormState = { message: "Yêu cầu không hợp lệ." };
const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Khách huỷ yêu cầu còn chờ duyệt; liên kết đơn (token) là bằng chứng chủ đơn.
export async function cancelReturnAction(token: string, requestId: string): Promise<FormState> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128 || !isId(requestId)) return INVALID;
  const order = await findOrderByToken(token);
  if (!order) return INVALID;
  const ok = await cancelReturnRequest(requestId, order.id);
  refresh();
  return ok ? { ok: true, message: "Đã huỷ yêu cầu trả hàng." } : { message: "Yêu cầu đã được xử lý nên không huỷ được." };
}

// Nhân viên duyệt (chốt số tiền hoàn, có thể khác số đề xuất) hoặc từ chối (bắt buộc ghi lý do).
export async function decideReturnAction(id: string, approve: boolean, input: { amount?: unknown; note?: unknown }): Promise<FormState> {
  if (!isId(id) || typeof approve !== "boolean" || typeof input !== "object" || input === null) return INVALID;
  const audit = await staffWith("orders.process");
  if (!audit) return FORBIDDEN;
  const request = await findReturnRequest(id);
  if (!request) return INVALID;
  const staffNote = text(input.note, 500);
  let ok: boolean;
  if (approve) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > request.orderTotal) {
      return { message: `Số tiền hoàn phải từ 1 đến ${formatVnd(request.orderTotal)} (tổng đơn).` };
    }
    ok = await decideReturnRequest(id, { approve: true, amount, staffNote }, audit({
      action: "return.approve",
      entity: "return_requests",
      summary: `Duyệt trả hàng ${request.code}, hoàn ${formatVnd(amount)}`,
      detail: { suggested: request.refundAmount, amount },
    }));
  } else {
    if (staffNote.length < 5) return { message: "Ghi lý do từ chối để gửi cho khách." };
    ok = await decideReturnRequest(id, { approve: false, staffNote }, audit({ action: "return.reject", entity: "return_requests", summary: `Từ chối trả hàng ${request.code}` }));
  }
  refresh();
  if (!ok) return { message: "Yêu cầu đã được xử lý bởi người khác hoặc khách vừa huỷ." };
  await notifyReturnEvent(id, approve ? "approved" : "rejected");
  return { ok: true, message: approve ? "Đã duyệt và báo khách gửi hàng về." : "Đã từ chối và báo khách." };
}

// Kho lập phiếu nhập hàng trả (nháp) cho yêu cầu đã duyệt.
export async function createReturnDocumentAction(id: string): Promise<FormState & { documentId?: string }> {
  if (!isId(id)) return INVALID;
  const audit = await staffWith("inventory.draft");
  if (!audit) return FORBIDDEN;
  const result = await createReturnDocument(id, audit({ action: "return.document", entity: "return_requests", entityId: id, summary: "Lập phiếu hàng trả" }));
  refresh();
  if (!result.ok) return { message: result.message };
  return { ok: true, message: "Đã lập phiếu nháp. Kiểm hàng thực nhận rồi ghi sổ phiếu.", documentId: result.documentId };
}

// Kế toán ghi nhận đã hoàn tiền (sau khi phiếu hàng trả đã ghi sổ).
export async function refundReturnAction(id: string, reference: unknown): Promise<FormState> {
  if (!isId(id)) return INVALID;
  const audit = await staffWith("payments.manage");
  if (!audit) return FORBIDDEN;
  const request = await findReturnRequest(id);
  if (!request) return INVALID;
  const ref = text(reference, 100);
  const result = await recordReturnRefund(id, ref, audit({
    action: "return.refund",
    entity: "return_requests",
    summary: `Hoàn ${formatVnd(request.refundAmount)} cho ${request.code}`,
    detail: { reference: ref },
  }));
  refresh();
  if (!result.ok) return { message: result.message };
  await notifyReturnEvent(id, "refunded");
  return { ok: true, message: "Đã ghi nhận hoàn tiền và báo khách." };
}
