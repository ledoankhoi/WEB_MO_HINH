"use server";

import { refresh } from "next/cache";
import { COMMENT_MAX, isReportReason } from "@/lib/community";
import type { FormState } from "@/lib/types";
import { getCurrentUser } from "@/server/auth/session";
import { addComment, dismissReport, moderatePost, reportContent, setCommentStatus, toggleLike } from "@/server/repo/community";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Cộng đồng: thao tác của khách (bình luận, thả tim, báo cáo) và của nhân viên kiểm duyệt (community.moderate).
// Đăng bài kèm ảnh ở Route Handler POST /api/cong-dong/bai-viet.

const LOGIN: FormState = { message: "Đăng nhập để tham gia cộng đồng." };

export async function addCommentAction(postId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const body = String(form.get("body") ?? "").trim();
  if (!isId(postId)) return { message: "Yêu cầu không hợp lệ." };
  if (body.length < 2 || body.length > COMMENT_MAX) return { errors: { body: `Bình luận cần từ 2 đến ${COMMENT_MAX} ký tự.` }, values: { body } };
  const limit = await consumeRateLimit(`comment:${user.id}`, 20, 10 * 60 * 1000);
  if (!limit.allowed) return { message: "Bạn bình luận nhanh quá, nghỉ tay một chút nhé.", values: { body } };
  if (!(await addComment(user.id, postId, body))) return { message: "Bài viết không còn hiển thị." };
  refresh();
  return { ok: true };
}

export async function toggleLikeAction(postId: string): Promise<{ ok: boolean; liked?: boolean; likes?: number; message?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: LOGIN.message };
  if (!isId(postId)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const result = await toggleLike(user.id, postId);
  return result ? { ok: true, ...result } : { ok: false, message: "Bài viết không còn hiển thị." };
}

export async function reportAction(target: "post" | "comment", id: string, reason: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  if ((target !== "post" && target !== "comment") || !isId(id) || !isReportReason(reason)) return { message: "Yêu cầu không hợp lệ." };
  const result = await reportContent(user.id, target === "post" ? { postId: id } : { commentId: id }, reason);
  if (result === "not_found") return { message: "Nội dung không còn tồn tại." };
  return { ok: true, message: result === "duplicate" ? "Bạn đã báo cáo nội dung này, nhân viên đang xem xét." : "Đã gửi báo cáo. Cảm ơn bạn!" };
}

// ----- Nhân viên -----

export async function moderatePostAction(id: string, status: string, note: string): Promise<FormState> {
  const audit = await staffWith("community.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || (status !== "approved" && status !== "hidden") || typeof note !== "string" || note.length > 300) return { message: "Yêu cầu không hợp lệ." };
  const changed = await moderatePost(
    id,
    status,
    note.trim(),
    audit({ action: `community_post.${status === "approved" ? "approve" : "hide"}`, entity: "community_posts", summary: status === "approved" ? "Duyệt bài cộng đồng" : `Ẩn bài cộng đồng${note.trim() ? `: ${note.trim()}` : ""}` }),
  );
  refresh();
  return changed ? { ok: true } : { message: "Bài đã ở trạng thái này." };
}

export async function setCommentStatusAction(id: string, status: string): Promise<FormState> {
  const audit = await staffWith("community.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || (status !== "visible" && status !== "hidden")) return { message: "Yêu cầu không hợp lệ." };
  const changed = await setCommentStatus(id, status, audit({ action: `community_comment.${status === "hidden" ? "hide" : "show"}`, entity: "community_comments", summary: status === "hidden" ? "Ẩn bình luận" : "Hiện lại bình luận" }));
  refresh();
  return changed ? { ok: true } : { message: "Bình luận đã ở trạng thái này." };
}

export async function dismissReportAction(id: string): Promise<FormState> {
  const audit = await staffWith("community.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id)) return { message: "Yêu cầu không hợp lệ." };
  const changed = await dismissReport(id, audit({ action: "community_report.dismiss", entity: "community_reports", summary: "Bỏ qua báo cáo (không vi phạm)" }));
  refresh();
  return changed ? { ok: true } : { message: "Báo cáo đã được xử lý." };
}
