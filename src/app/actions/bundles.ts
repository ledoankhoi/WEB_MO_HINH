"use server";

import { refresh, updateTag } from "next/cache";
import { BUNDLE_MAX_PERCENT, BUNDLE_MAX_PRODUCTS, BUNDLE_MIN_PRODUCTS } from "@/lib/bundles";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { PRODUCTS_TAG } from "@/server/catalog";
import { saveDeal } from "@/server/repo/bundles";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

const INVALID = "Vui lòng kiểm tra lại các ô được đánh dấu.";

// Tạo hoặc sửa combo (nghiep-vu-ban-hang mục 12): tên, phần trăm giảm, bật/tắt, 2–10 sản phẩm.
export async function saveDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("coupons.manage");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const name = readText(form, "name");
  const percentText = readText(form, "percent");
  const isActive = form.get("isActive") === "on";
  const productIds = form.getAll("productIds").filter((value): value is string => typeof value === "string" && isId(value));
  const values = { name, percent: percentText, isActive: isActive ? "on" : "", productIds: productIds.join(",") };
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const errors: Record<string, string> = {};
  if (name.length < 3 || name.length > 80) errors.name = "Tên từ 3 đến 80 ký tự.";
  const percent = Number(percentText);
  if (!/^\d{1,2}$/.test(percentText) || percent < 1 || percent > BUNDLE_MAX_PERCENT) errors.percent = `Giảm từ 1 đến ${BUNDLE_MAX_PERCENT}%.`;
  if (productIds.length < BUNDLE_MIN_PRODUCTS || productIds.length > BUNDLE_MAX_PRODUCTS) errors.productIds = `Chọn từ ${BUNDLE_MIN_PRODUCTS} đến ${BUNDLE_MAX_PRODUCTS} sản phẩm.`;
  if (Object.keys(errors).length > 0) return { errors, values, message: INVALID };

  const saved = await saveDeal(
    id || null,
    { name, percent, isActive, productIds },
    audit({ action: id ? "bundle.update" : "bundle.create", entity: "bundle_deals", summary: `${id ? "Sửa" : "Tạo"} combo ${name}` }),
  );
  if (saved === "products") return { errors: { productIds: "Có sản phẩm không còn tồn tại." }, values, message: INVALID };
  if (saved === null) return { message: "Combo không còn tồn tại." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: "Đã lưu combo." };
}
