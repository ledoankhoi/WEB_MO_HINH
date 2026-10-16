"use server";

import { refresh, updateTag } from "next/cache";
import { parseVnDateTime } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { isEmail, isSafeLink, readText } from "@/lib/validation";
import { CONTENT_TAG } from "@/server/catalog";
import {
  deleteBanner,
  deleteNavItem,
  internalLinkExists,
  listBanners,
  saveBanner,
  saveNavItem,
  saveSetting,
  setBannerStatus,
  type BannerPlacement,
  type SettingKey,
} from "@/server/repo/content";
import { FORBIDDEN, changes, isId, staffWith } from "@/server/staff-action";

// YC-CMS-01: banner trang chủ.
export async function saveBannerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const values = Object.fromEntries(["id", "title", "subtitle", "imageUrl", "imageMobileUrl", "linkUrl", "placement", "sortOrder", "startsAt", "endsAt"].map((key) => [key, readText(form, key)]));
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };

  const errors: Record<string, string> = {};
  if (values.title.length < 2 || values.title.length > 120) errors.title = "Tiêu đề cần từ 2 đến 120 ký tự.";
  if (values.subtitle.length > 200) errors.subtitle = "Phụ đề tối đa 200 ký tự.";
  if (!values.imageUrl || !isSafeLink(values.imageUrl)) errors.imageUrl = "Cần ảnh (tải lên, hoặc đường dẫn https:// hay bắt đầu bằng /).";
  if (values.imageMobileUrl && !isSafeLink(values.imageMobileUrl)) errors.imageMobileUrl = "Đường dẫn ảnh không hợp lệ.";
  if (values.linkUrl && !isSafeLink(values.linkUrl)) errors.linkUrl = "Liên kết nội bộ bắt đầu bằng /, liên kết ngoài phải là https://.";
  const placement = (["home_hero", "home_strip"] as const).find((value) => value === values.placement);
  if (!placement) errors.placement = "Vui lòng chọn vị trí.";
  if (!/^\d{1,3}$/.test(values.sortOrder || "0")) errors.sortOrder = "Thứ tự là số từ 0 đến 999.";
  const startsAt = values.startsAt ? parseVnDateTime(values.startsAt) : null;
  const endsAt = values.endsAt ? parseVnDateTime(values.endsAt) : null;
  if (values.startsAt && startsAt === null) errors.startsAt = "Thời gian không hợp lệ.";
  if (values.endsAt && endsAt === null) errors.endsAt = "Thời gian không hợp lệ.";
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) errors.endsAt = "Kết thúc phải sau bắt đầu.";
  if (Object.keys(errors).length > 0 || !placement) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const old = id ? (await listBanners()).find((banner) => banner.id === id) : undefined;
  if (id && !old) return { message: "Banner không còn tồn tại.", values };
  const input = {
    title: values.title,
    subtitle: values.subtitle,
    imageUrl: values.imageUrl,
    imageMobileUrl: values.imageMobileUrl || null,
    linkUrl: values.linkUrl,
    placement: placement as BannerPlacement,
    sortOrder: Number(values.sortOrder || 0),
    startsAt,
    endsAt,
  };
  const saved = await saveBanner(
    id || null,
    input,
    audit({ action: id ? "banner.update" : "banner.create", entity: "banners", summary: `${id ? "Sửa" : "Tạo"} banner ${input.title}`, detail: changes(old ?? {}, input) }),
  );
  if (!saved) return { message: "Banner không còn tồn tại.", values };
  updateTag(CONTENT_TAG);
  refresh();
  return { ok: true, message: id ? "Đã lưu banner." : `Đã tạo banner ${input.title} (bản nháp).` };
}

export async function bannerAction(id: string, action: "publish" | "unpublish" | "delete"): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || !["publish", "unpublish", "delete"].includes(action)) return { message: "Yêu cầu không hợp lệ." };
  const banner = (await listBanners()).find((item) => item.id === id);
  if (!banner) return { message: "Banner không còn tồn tại." };
  const label = { publish: "Xuất bản", unpublish: "Gỡ xuống", delete: "Xoá" }[action];
  const entry = audit({ action: `banner.${action}`, entity: "banners", summary: `${label} banner ${banner.title}` });
  const done = action === "delete" ? await deleteBanner(id, entry) : await setBannerStatus(id, action === "publish" ? "published" : "draft", entry);
  updateTag(CONTENT_TAG);
  refresh();
  return done ? { ok: true } : { message: "Banner đã ở trạng thái này." };
}

// YC-CMS-03: một mục menu đầu trang hoặc chân trang. Liên kết nội bộ phải trỏ tới trang có thật.
export async function saveNavItemAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const values = { id, menu: readText(form, "menu"), label: readText(form, "label"), url: readText(form, "url"), sortOrder: readText(form, "sortOrder") || "0", isActive: form.get("isActive") === "on" ? "on" : "" };
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };
  const errors: Record<string, string> = {};
  const menu = (["header", "footer"] as const).find((value) => value === values.menu);
  if (!menu) errors.menu = "Vui lòng chọn menu.";
  if (values.label.length < 1 || values.label.length > 40) errors.label = "Nhãn cần 1–40 ký tự.";
  if (!isSafeLink(values.url)) errors.url = "Liên kết nội bộ bắt đầu bằng /, liên kết ngoài phải là https://.";
  else if (values.url.startsWith("/") && !(await internalLinkExists(values.url))) errors.url = "Không có trang này trên cửa hàng (hoặc trang chưa xuất bản).";
  if (!/^\d{1,3}$/.test(values.sortOrder)) errors.sortOrder = "Thứ tự là số từ 0 đến 999.";
  if (Object.keys(errors).length > 0 || !menu) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };

  const input = { menu, label: values.label, url: values.url, sortOrder: Number(values.sortOrder), isActive: values.isActive === "on" };
  const saved = await saveNavItem(id || null, input, audit({ action: id ? "nav.update" : "nav.create", entity: "nav_items", summary: `${id ? "Sửa" : "Thêm"} mục menu ${input.label}`, detail: { after: input } }));
  if (!saved) return { message: "Mục menu không còn tồn tại.", values };
  updateTag(CONTENT_TAG);
  refresh();
  return { ok: true, message: id ? "Đã lưu mục menu." : `Đã thêm ${input.label}.` };
}

export async function deleteNavItemAction(id: string): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  await deleteNavItem(id, audit({ action: "nav.delete", entity: "nav_items", summary: "Xoá mục menu" }));
  updateTag(CONTENT_TAG);
  refresh();
  return { ok: true };
}

// YC-CMS-05, 06: thanh thông báo, thông tin liên hệ, chính sách.
export async function saveSettingsAction(key: SettingKey, _prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  const values = Object.fromEntries([...form.entries()].map(([name, value]) => [name, String(value).trim()]));
  const errors: Record<string, string> = {};
  const entry = audit({ action: `settings.${key}`, entity: "site_settings", summary: `Sửa cài đặt hiển thị: ${{ contact: "liên hệ", announcement: "thanh thông báo", policy: "chính sách" }[key] ?? key}` });

  if (key === "contact") {
    const value = { phone: values.phone ?? "", email: (values.email ?? "").toLowerCase(), address: values.address ?? "", hours: values.hours ?? "" };
    if (value.phone.length > 30) errors.phone = "Tối đa 30 ký tự.";
    if (value.email && !isEmail(value.email)) errors.email = "Email không hợp lệ.";
    if (value.address.length > 200) errors.address = "Tối đa 200 ký tự.";
    if (value.hours.length > 100) errors.hours = "Tối đa 100 ký tự.";
    if (Object.keys(errors).length === 0) await saveSetting("contact", value, entry);
  } else if (key === "announcement") {
    const startsAt = values.startsAt ? parseVnDateTime(values.startsAt) : null;
    const endsAt = values.endsAt ? parseVnDateTime(values.endsAt) : null;
    const value = { enabled: values.enabled === "on", text: values.text ?? "", linkUrl: values.linkUrl ?? "", startsAt, endsAt };
    if (value.text.length > 200) errors.text = "Tối đa 200 ký tự.";
    if (value.enabled && !value.text) errors.text = "Nhập nội dung trước khi bật.";
    if (value.linkUrl && !isSafeLink(value.linkUrl)) errors.linkUrl = "Liên kết nội bộ bắt đầu bằng /, liên kết ngoài phải là https://.";
    if (values.startsAt && startsAt === null) errors.startsAt = "Thời gian không hợp lệ.";
    if (values.endsAt && endsAt === null) errors.endsAt = "Thời gian không hợp lệ.";
    if (startsAt !== null && endsAt !== null && endsAt <= startsAt) errors.endsAt = "Kết thúc phải sau bắt đầu.";
    if (Object.keys(errors).length === 0) await saveSetting("announcement", value, entry);
  } else if (key === "policy") {
    const returnDays = /^\d{1,3}$/.test(values.returnDays ?? "") ? Number(values.returnDays) : NaN;
    const warrantyMonths = /^\d{1,3}$/.test(values.warrantyMonths ?? "") ? Number(values.warrantyMonths) : NaN;
    if (!(returnDays <= 365)) errors.returnDays = "Số ngày từ 0 đến 365.";
    if (!(warrantyMonths <= 120)) errors.warrantyMonths = "Số tháng từ 0 đến 120.";
    if (Object.keys(errors).length === 0) await saveSetting("policy", { returnDays, warrantyMonths }, entry);
  } else {
    return { message: "Yêu cầu không hợp lệ." };
  }
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  updateTag(CONTENT_TAG);
  refresh();
  return { ok: true, message: "Đã lưu." };
}
