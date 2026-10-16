"use server";

import { refresh, updateTag } from "next/cache";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { setReviewStatus, submitReview } from "@/server/repo/reviews";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// YC-DG-01: khách đã đăng nhập đánh giá một dòng đơn đã hoàn tất của chính mình, mỗi dòng một lần.
export async function submitReviewAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập để đánh giá." };
  const orderItemId = Number(readText(form, "orderItemId"));
  const rating = Number(readText(form, "rating"));
  // Tên ô nhận xét kèm id dòng đơn để id trên trang không trùng khi có nhiều form.
  const comment = readText(form, `comment-${orderItemId}`);
  const values = { rating: readText(form, "rating"), comment };
  if (!Number.isSafeInteger(orderItemId) || orderItemId <= 0) return { message: "Yêu cầu không hợp lệ." };
  const errors: Record<string, string> = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Vui lòng chọn từ 1 đến 5 sao.";
  if (comment.length > 1000) errors.comment = "Nhận xét tối đa 1000 ký tự.";
  if (Object.keys(errors).length > 0) return { errors, values, message: "Vui lòng kiểm tra lại." };

  const result = await submitReview(user.id, orderItemId, rating, comment);
  if (result === "duplicate") return { message: "Bạn đã đánh giá sản phẩm này trong đơn hàng này." };
  if (result === "not_allowed") return { message: "Chỉ đánh giá được sản phẩm trong đơn hàng đã hoàn tất của bạn." };
  refresh();
  return { ok: true, message: "Cảm ơn bạn. Đánh giá sẽ hiện sau khi được duyệt." };
}

// YC-QT-08: duyệt hoặc ẩn đánh giá.
export async function moderateReviewAction(id: string, status: "approved" | "hidden"): Promise<FormState> {
  const audit = await staffWith("reviews.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || (status !== "approved" && status !== "hidden")) return { message: "Yêu cầu không hợp lệ." };
  const done = await setReviewStatus(
    id,
    status,
    audit({ action: `review.${status === "approved" ? "approve" : "hide"}`, entity: "reviews", summary: status === "approved" ? "Duyệt đánh giá" : "Ẩn đánh giá" }),
  );
  if (!done) return { message: "Đánh giá đã ở trạng thái này hoặc không còn tồn tại." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}
