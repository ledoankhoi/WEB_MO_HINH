"use server";

import { refresh } from "next/cache";
import { parseVnDateTime } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { listCoupons, saveCoupon } from "@/server/repo/coupons";
import { listTaxonomy } from "@/server/repo/taxonomy";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";

const FIELDS = ["id", "code", "kind", "value", "maxDiscount", "minSubtotal", "categoryId", "startsAt", "endsAt", "usageLimit"] as const;
const MONEY = /^\d{1,10}$/;

// QT-21: tạo, sửa mã giảm giá. Hạn mức không được nhỏ hơn số lượt đã dùng (CSDL chặn).
export async function saveCouponAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("coupons.manage");
  if (!audit) return FORBIDDEN;
  const values: Record<string, string> = Object.fromEntries(FIELDS.map((key) => [key, readText(form, key)]));
  values.code = values.code.toUpperCase();
  values.isActive = form.get("isActive") === "on" ? "on" : "";
  const id = values.id;
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };

  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9_-]{3,30}$/.test(values.code)) errors.code = "Mã gồm 3–30 chữ không dấu, số, gạch ngang hoặc gạch dưới.";
  const kind = (["fixed", "percent"] as const).find((value) => value === values.kind);
  if (!kind) errors.kind = "Vui lòng chọn loại giảm.";
  const value = Number(values.value);
  if (!MONEY.test(values.value) || value <= 0 || (kind === "percent" && value > 100)) errors.value = kind === "percent" ? "Phần trăm từ 1 đến 100." : "Số tiền phải lớn hơn 0.";
  if (values.maxDiscount && (!MONEY.test(values.maxDiscount) || Number(values.maxDiscount) <= 0)) errors.maxDiscount = "Số tiền phải lớn hơn 0.";
  if (!MONEY.test(values.minSubtotal || "0")) errors.minSubtotal = "Số tiền không hợp lệ.";
  if (values.usageLimit && (!/^\d{1,7}$/.test(values.usageLimit) || Number(values.usageLimit) <= 0)) errors.usageLimit = "Số lượt phải lớn hơn 0.";
  if (values.categoryId && !(await listTaxonomy("categories")).some((category) => category.id === values.categoryId)) errors.categoryId = "Danh mục không tồn tại.";
  const startsAt = values.startsAt ? parseVnDateTime(values.startsAt) : null;
  const endsAt = values.endsAt ? parseVnDateTime(values.endsAt) : null;
  if (values.startsAt && startsAt === null) errors.startsAt = "Thời gian không hợp lệ.";
  if (values.endsAt && endsAt === null) errors.endsAt = "Thời gian không hợp lệ.";
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) errors.endsAt = "Kết thúc phải sau bắt đầu.";
  if (Object.keys(errors).length > 0 || !kind) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const old = id ? (await listCoupons()).find((coupon) => coupon.id === id) : undefined;
  if (id && !old) return { message: "Mã giảm giá không còn tồn tại.", values };
  const input = {
    code: values.code,
    kind,
    value,
    maxDiscount: kind === "percent" && values.maxDiscount ? Number(values.maxDiscount) : null,
    minSubtotal: Number(values.minSubtotal || 0),
    categoryId: values.categoryId || null,
    startsAt,
    endsAt,
    usageLimit: values.usageLimit ? Number(values.usageLimit) : null,
    isActive: values.isActive === "on",
  };
  const saved = await saveCoupon(
    id || null,
    input,
    audit({ action: id ? "coupon.update" : "coupon.create", entity: "coupons", summary: `${id ? "Sửa" : "Tạo"} mã giảm giá ${input.code}`, detail: changes(old ?? {}, input) }),
  );
  if (saved === "duplicate") return { errors: { code: "Mã này đã có." }, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  if (!saved) return { errors: { usageLimit: `Đã dùng ${old?.usedCount ?? 0} lượt, hạn mức không được nhỏ hơn.` }, values, message: "Không lưu được mã giảm giá." };
  refresh();
  return { ok: true, message: id ? "Đã lưu mã giảm giá." : `Đã tạo mã ${input.code}.` };
}
