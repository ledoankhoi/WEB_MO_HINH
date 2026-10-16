"use server";

import { refresh, updateTag } from "next/cache";
import { parseVnDateTime } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { isSafeLink, readText } from "@/lib/validation";
import { CONTENT_TAG } from "@/server/catalog";
import { deleteBanner, listBanners, saveBanner, setBannerStatus, type BannerPlacement } from "@/server/repo/content";
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
