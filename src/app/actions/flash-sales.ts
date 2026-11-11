"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { FLASH_MAX_DAYS } from "@/lib/flash-sale";
import { parseVnDateTime } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { PRODUCTS_TAG } from "@/server/catalog";
import { removeFlashItem, saveFlashItem, saveFlashSale } from "@/server/repo/flash-sales";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

const INVALID = "Vui lòng kiểm tra lại các ô được đánh dấu.";
const COUNT = /^\d{1,6}$/;

// Tạo hoặc sửa chương trình flash sale: tên, khung giờ (giờ Việt Nam, tối đa FLASH_MAX_DAYS ngày), bật/tắt.
export async function saveFlashSaleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("coupons.manage");
  if (!audit) return FORBIDDEN;
  const values = { id: readText(form, "id"), title: readText(form, "title"), startsAt: readText(form, "startsAt"), endsAt: readText(form, "endsAt") };
  const isActive = form.get("isActive") === "on";
  if (values.id && !isId(values.id)) return { message: "Yêu cầu không hợp lệ." };
  const errors: Record<string, string> = {};
  if (values.title.length < 3 || values.title.length > 60) errors.title = "Tên từ 3 đến 60 ký tự.";
  const startsAt = parseVnDateTime(values.startsAt);
  const endsAt = parseVnDateTime(values.endsAt);
  if (startsAt === null) errors.startsAt = "Thời gian không hợp lệ.";
  if (endsAt === null) errors.endsAt = "Thời gian không hợp lệ.";
  if (startsAt !== null && endsAt !== null) {
    if (endsAt <= startsAt) errors.endsAt = "Kết thúc phải sau bắt đầu.";
    else if (endsAt - startsAt > FLASH_MAX_DAYS * 24 * 3600 * 1000) errors.endsAt = `Một chương trình dài tối đa ${FLASH_MAX_DAYS} ngày.`;
  }
  if (Object.keys(errors).length > 0 || startsAt === null || endsAt === null) return { errors, values: { ...values, isActive: isActive ? "on" : "" }, message: INVALID };

  const result = await saveFlashSale(
    values.id || null,
    { title: values.title, startsAt, endsAt, isActive },
    audit({ action: values.id ? "flash_sale.update" : "flash_sale.create", entity: "flash_sales", entityId: values.id || undefined, summary: `${values.id ? "Sửa" : "Tạo"} flash sale ${values.title}` }),
  );
  if (!result.ok) {
    return result.reason === "overlap"
      ? { errors: { startsAt: "Có phiên bản trong chương trình trùng giờ với một flash sale khác đang bật." }, values, message: INVALID }
      : { message: "Chương trình không còn tồn tại." };
  }
  updateTag(PRODUCTS_TAG);
  if (!values.id) redirect(`/admin/flash-sale/${result.id}`);
  refresh();
  return { ok: true, message: "Đã lưu." };
}

// Thêm hoặc sửa một phiên bản trong chương trình: giá sale (thấp hơn giá thường), tổng suất, tối đa mỗi đơn.
export async function saveFlashItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("coupons.manage");
  if (!audit) return FORBIDDEN;
  const values = {
    saleId: readText(form, "saleId"),
    variantId: readText(form, "variantId"),
    salePrice: readText(form, "salePrice"),
    qtyLimit: readText(form, "qtyLimit"),
    maxPerOrder: readText(form, "maxPerOrder"),
  };
  if (!isId(values.saleId)) return { message: "Yêu cầu không hợp lệ." };
  const errors: Record<string, string> = {};
  if (!isId(values.variantId)) errors.variantId = "Chọn phiên bản.";
  if (!/^\d{1,10}$/.test(values.salePrice) || Number(values.salePrice) <= 0) errors.salePrice = "Giá sale phải lớn hơn 0.";
  if (!COUNT.test(values.qtyLimit) || Number(values.qtyLimit) <= 0) errors.qtyLimit = "Số suất phải lớn hơn 0.";
  if (values.maxPerOrder && (!COUNT.test(values.maxPerOrder) || Number(values.maxPerOrder) <= 0)) errors.maxPerOrder = "Bỏ trống hoặc lớn hơn 0.";
  if (Object.keys(errors).length > 0) return { errors, values, message: INVALID };

  const result = await saveFlashItem(
    values.saleId,
    { variantId: values.variantId, salePrice: Number(values.salePrice), qtyLimit: Number(values.qtyLimit), maxPerOrder: values.maxPerOrder ? Number(values.maxPerOrder) : null },
    audit({ action: "flash_sale.item", entity: "flash_sales", summary: "Thêm/sửa phiên bản trong flash sale" }),
  );
  if (result === "price") return { errors: { salePrice: "Giá sale phải thấp hơn giá thường của phiên bản." }, values, message: INVALID };
  if (result === "overlap") return { errors: { variantId: "Phiên bản này đã có trong một flash sale khác trùng giờ." }, values, message: INVALID };
  if (result === "below_sold") return { errors: { qtyLimit: "Số suất không được nhỏ hơn số đã bán." }, values, message: INVALID };
  if (result === "not_found") return { errors: { variantId: "Phiên bản không còn bán." }, values, message: INVALID };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: "Đã lưu phiên bản." };
}

export async function removeFlashItemAction(saleId: string, variantId: string): Promise<FormState> {
  const audit = await staffWith("coupons.manage");
  if (!audit) return FORBIDDEN;
  if (!isId(saleId) || !isId(variantId)) return { message: "Yêu cầu không hợp lệ." };
  const result = await removeFlashItem(saleId, variantId, audit({ action: "flash_sale.item_remove", entity: "flash_sales", summary: "Bỏ phiên bản khỏi flash sale" }));
  if (result === "sold") return { message: "Đã có đơn mua bằng giá sale của phiên bản này: không bỏ được, hãy tắt chương trình hoặc hạ số suất." };
  if (result === "not_found") return { message: "Phiên bản đã được bỏ trước đó." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}
