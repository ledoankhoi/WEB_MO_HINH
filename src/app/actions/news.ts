"use server";

import { refresh, updateTag } from "next/cache";
import { slugify } from "@/lib/format";
import type { FormState } from "@/lib/types";
import { isSafeLink, readText } from "@/lib/validation";
import { CONTENT_TAG } from "@/server/catalog";
import { isConstraintError } from "@/server/db";
import { deleteNews, findNews, saveNews, setNewsStatus } from "@/server/repo/news";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Tin tức (/tin-tuc): văn bản thuần như trang thông tin (Q19), quyền content.edit.
export async function saveNewsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  const id = readText(form, "id");
  const values = {
    id,
    title: readText(form, "title"),
    slug: readText(form, "slug"),
    summary: readText(form, "summary"),
    coverImage: readText(form, "coverImage"),
    body: readText(form, "body").replace(/\r\n/g, "\n"),
  };
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ.", values };
  const slug = values.slug || slugify(values.title).slice(0, 80).replace(/-+$/, "");
  const errors: Record<string, string> = {};
  if (values.title.length < 2 || values.title.length > 160) errors.title = "Tiêu đề cần từ 2 đến 160 ký tự.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) errors.slug = "Đường dẫn chỉ gồm chữ thường không dấu, số và gạch nối (tối đa 80 ký tự).";
  if (values.summary.length > 300) errors.summary = "Tóm tắt tối đa 300 ký tự.";
  if (values.coverImage && !isSafeLink(values.coverImage)) errors.coverImage = "Ảnh bìa phải là đường dẫn https:// hoặc bắt đầu bằng /.";
  if (values.body.length < 1 || values.body.length > 30000) errors.body = "Nội dung cần từ 1 đến 30.000 ký tự.";
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại các ô được đánh dấu." };
  try {
    const saved = await saveNews(
      id || null,
      { slug, title: values.title, summary: values.summary, body: values.body, coverImage: values.coverImage || null },
      audit({ action: id ? "news.update" : "news.create", entity: "news_posts", summary: `${id ? "Sửa" : "Viết"} bài tin tức ${values.title}` }),
    );
    if (!saved) return { message: "Bài viết không còn tồn tại.", values };
  } catch (error) {
    if (isConstraintError(error)) return { errors: { slug: "Đường dẫn này đã có bài khác dùng." }, values };
    throw error;
  }
  updateTag(CONTENT_TAG);
  refresh();
  return { ok: true, message: id ? "Đã lưu bài viết." : `Đã tạo bài ${values.title} (bản nháp).` };
}

export async function newsAction(id: string, action: "publish" | "unpublish" | "delete"): Promise<FormState> {
  const audit = await staffWith("content.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || !["publish", "unpublish", "delete"].includes(action)) return { message: "Yêu cầu không hợp lệ." };
  const post = await findNews(id);
  if (!post) return { message: "Bài viết không còn tồn tại." };
  const verb = { publish: "Xuất bản", unpublish: "Gỡ xuống", delete: "Xoá" }[action];
  const entry = audit({ action: `news.${action}`, entity: "news_posts", summary: `${verb} bài tin tức ${post.title}` });
  const done = action === "delete" ? await deleteNews(id, entry) : await setNewsStatus(id, action === "publish" ? "published" : "draft", entry);
  updateTag(CONTENT_TAG);
  refresh();
  return done ? { ok: true } : { message: "Bài viết đã ở trạng thái này." };
}
