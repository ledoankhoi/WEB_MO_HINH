"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { formatDate, parseVnDate } from "@/lib/format";
import { DEPOSIT_PERCENT_MAX, DEPOSIT_PERCENT_MIN } from "@/lib/preorder";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { PRODUCTS_TAG } from "@/server/catalog";
import { notifyPreorder } from "@/server/email/preorder-mails";
import {
  allocateOffer,
  createOffer,
  endOffer,
  findOffer,
  listWaitingOrders,
  setOfferAccepting,
  updateOffer,
  type OfferInput,
} from "@/server/repo/preorders";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";

const DAY = 24 * 3600 * 1000;
const FIELDS = ["id", "variantId", "expectedAt", "depositPercent", "maxQty", "note"] as const;

// Đọc và kiểm tra ô của form đợt đặt trước (dùng chung cho tạo và sửa).
function readOffer(form: FormData): { values: Record<string, string>; errors: Record<string, string>; input: OfferInput | null } {
  const values: Record<string, string> = Object.fromEntries(FIELDS.map((key) => [key, readText(form, key)]));
  const errors: Record<string, string> = {};
  const expectedAt = parseVnDate(values.expectedAt);
  const now = Date.now();
  if (expectedAt === null) errors.expectedAt = "Chọn ngày dự kiến về.";
  else if (expectedAt < now - 2 * DAY || expectedAt > now + 730 * DAY) errors.expectedAt = "Ngày về phải từ hôm nay tới 2 năm tới.";
  const deposit = Number(values.depositPercent);
  if (!/^\d{1,3}$/.test(values.depositPercent) || deposit < DEPOSIT_PERCENT_MIN || deposit > DEPOSIT_PERCENT_MAX) {
    errors.depositPercent = `Phần trăm cọc từ ${DEPOSIT_PERCENT_MIN} đến ${DEPOSIT_PERCENT_MAX}.`;
  }
  const maxQty = values.maxQty ? Number(values.maxQty) : null;
  if (values.maxQty && (!/^\d{1,6}$/.test(values.maxQty) || maxQty! <= 0)) errors.maxQty = "Số suất phải lớn hơn 0 (bỏ trống nếu không giới hạn).";
  if (values.note.length > 300) errors.note = "Ghi chú tối đa 300 ký tự.";
  const input = Object.keys(errors).length === 0 ? { expectedAt: expectedAt!, depositPercent: deposit, maxQty, note: values.note } : null;
  return { values, errors, input };
}

// Mở đợt đặt trước cho một phiên bản (quyền catalog.edit). Xong thì sang trang của đợt.
export async function createOfferAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const { values, errors, input } = readOffer(form);
  if (!isId(values.variantId)) errors.variantId = "Chọn phiên bản.";
  if (!input || errors.variantId) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  const result = await createOffer(
    values.variantId,
    input,
    audit({ action: "preorder.create", entity: "preorder_offers", summary: `Mở đặt trước, dự kiến về ${formatDate(input.expectedAt)}`, detail: { variantId: values.variantId, ...input } }),
  );
  if (!result.ok) {
    return result.reason === "exists"
      ? { errors: { variantId: "Phiên bản này đang có đợt đặt trước chưa kết thúc." }, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." }
      : { errors: { variantId: "Phiên bản không còn bán." }, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  }
  updateTag(PRODUCTS_TAG);
  redirect(`/admin/dat-truoc/${result.id}`);
}

// Sửa đợt. Dời ngày về thì báo cho khách đang chờ hàng của đợt (mỗi đơn một thư).
export async function updateOfferAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const { values, errors, input } = readOffer(form);
  if (!isId(values.id)) return { message: "Yêu cầu không hợp lệ." };
  if (!input) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  const before = await findOffer(values.id);
  if (!before) return { message: "Đợt đặt trước không còn tồn tại." };
  const result = await updateOffer(
    values.id,
    input,
    audit({
      action: "preorder.update",
      entity: "preorder_offers",
      entityId: values.id,
      summary: `Sửa đặt trước ${before.sku}`,
      detail: changes({ expectedAt: before.expectedAt, depositPercent: before.depositPercent, maxQty: before.maxQty, note: before.note }, input),
    }),
  );
  if (!result.ok) {
    return result.reason === "below_taken"
      ? { errors: { maxQty: `Đã có ${before.taken} suất được đặt; số suất không được nhỏ hơn.` }, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." }
      : { message: "Đợt đặt trước đã kết thúc, không sửa được." };
  }
  let notified = 0;
  if (result.etaChanged) {
    for (const orderId of await listWaitingOrders(values.id)) {
      await notifyPreorder(orderId, { kind: "delayed", productName: before.productName, from: result.previousAt, to: input.expectedAt });
      notified += 1;
    }
  }
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: notified > 0 ? `Đã lưu và gửi thư báo đổi ngày về cho ${notified} đơn đang chờ.` : "Đã lưu." };
}

// Ngừng nhận đặt hoặc mở lại.
export async function setOfferAcceptingAction(id: string, open: boolean): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || typeof open !== "boolean") return { message: "Yêu cầu không hợp lệ." };
  const changed = await setOfferAccepting(
    id,
    open,
    audit({ action: open ? "preorder.open" : "preorder.close", entity: "preorder_offers", summary: open ? "Mở lại nhận đặt trước" : "Ngừng nhận đặt trước" }),
  );
  if (!changed) return { message: "Đợt đặt trước đã đổi trạng thái trước đó." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}

// Kết thúc đợt: phiên bản bán lại như thường theo tồn kho.
export async function endOfferAction(id: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const result = await endOffer(id, audit({ action: "preorder.end", entity: "preorder_offers", summary: "Kết thúc đợt đặt trước" }));
  if (result === "waiting") return { message: "Còn đơn đang chờ hàng của đợt này: phân bổ hàng hoặc huỷ các đơn đó trước khi kết thúc." };
  if (result === "not_found") return { message: "Đợt đặt trước đã kết thúc trước đó." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}

// Hàng về (đã nhập kho): giữ hàng cho các đơn theo thứ tự đặt, báo khách các đơn đã đủ hàng (quyền orders.fulfil).
export async function allocateOfferAction(id: string): Promise<FormState> {
  const audit = await staffWith("orders.fulfil");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const result = await allocateOffer(id, audit({ action: "preorder.allocate", entity: "orders", summary: "Phân bổ hàng đặt trước" }));
  if (!result) return { message: "Đợt đặt trước không còn hoạt động." };
  for (const orderId of result.readyOrders) await notifyPreorder(orderId, { kind: "arrived" });
  updateTag(PRODUCTS_TAG);
  refresh();
  const parts = [
    result.allocated > 0 ? `Đã giữ hàng cho ${result.allocated} đơn, ${result.readyOrders.length} đơn đủ hàng đã được báo khách.` : "Chưa giữ được hàng cho đơn nào.",
    result.short > 0 ? `${result.short} đơn còn chờ vì chưa đủ hàng (nhập thêm hàng rồi bấm lại).` : "",
    result.unpaidSkipped > 0 ? `${result.unpaidSkipped} đơn chưa cọc hoặc chưa trả nên chưa được giữ hàng.` : "",
  ].filter(Boolean);
  return { ok: result.allocated > 0, message: parts.join(" ") };
}
