"use server";

import { refresh, updateTag } from "next/cache";
import type { FormState } from "@/lib/types";
import { getCurrentUser } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { notifyQuestionAnswered } from "@/server/email/qa-mails";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { BODY_MAX, BODY_MIN, MAX_PENDING_QUESTIONS, answerAsBuyer, answerAsStaff, askQuestion, setAnswerStatus, setQuestionStatus } from "@/server/repo/questions";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

const HOUR = 3600 * 1000;

function readBody(value: unknown): string | null {
  const body = typeof value === "string" ? value.trim().replace(/\s+\n/g, "\n") : "";
  return body.length >= BODY_MIN && body.length <= BODY_MAX ? body : null;
}

// Khách hỏi về sản phẩm (phải đăng nhập). Câu hỏi chờ cửa hàng duyệt hoặc trả lời mới hiện.
export async function askQuestionAction(productId: string, text: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập để đặt câu hỏi." };
  if (!isId(productId)) return { message: "Yêu cầu không hợp lệ." };
  const body = readBody(text);
  if (!body) return { message: `Câu hỏi cần từ ${BODY_MIN} đến ${BODY_MAX} ký tự.` };
  const limit = await consumeRateLimit(`question:${user.id}`, 10, HOUR);
  if (!limit.allowed) return { message: "Bạn đặt quá nhiều câu hỏi. Vui lòng thử lại sau." };
  const result = await askQuestion(user.id, productId, body);
  if (result === "limit") return { message: `Bạn đang có ${MAX_PENDING_QUESTIONS} câu hỏi chờ trả lời. Vui lòng đợi cửa hàng trả lời trước.` };
  if (result === "not_found") return { message: "Sản phẩm không còn bán." };
  return { ok: true, message: "Đã gửi câu hỏi. Câu hỏi sẽ hiện khi cửa hàng duyệt hoặc trả lời; bạn nhận email khi có câu trả lời." };
}

// Khách đã mua sản phẩm trả lời một câu hỏi. Chờ duyệt.
export async function answerQuestionAction(questionId: string, text: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập để trả lời." };
  if (!isId(questionId)) return { message: "Yêu cầu không hợp lệ." };
  const body = readBody(text);
  if (!body) return { message: `Câu trả lời cần từ ${BODY_MIN} đến ${BODY_MAX} ký tự.` };
  const limit = await consumeRateLimit(`answer:${user.id}`, 20, HOUR);
  if (!limit.allowed) return { message: "Bạn trả lời quá nhiều. Vui lòng thử lại sau." };
  const result = await answerAsBuyer(user.id, questionId, body);
  if (result === "not_buyer") return { message: "Chỉ khách đã mua sản phẩm này (đơn hoàn tất) mới trả lời được." };
  if (result === "not_found") return { message: "Câu hỏi không còn hiện." };
  return { ok: true, message: "Cảm ơn bạn! Câu trả lời sẽ hiện sau khi cửa hàng duyệt." };
}

// Quản trị: nhân viên trả lời (hiện ngay, câu hỏi được duyệt), báo người hỏi qua email.
export async function staffAnswerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("reviews.moderate");
  if (!audit) return FORBIDDEN;
  const questionId = String(form.get("questionId") ?? "");
  if (!isId(questionId)) return { message: "Yêu cầu không hợp lệ." };
  const body = readBody(form.get("body"));
  if (!body) return { message: `Câu trả lời cần từ ${BODY_MIN} đến ${BODY_MAX} ký tự.`, values: { body: String(form.get("body") ?? "") } };
  const answered = await answerAsStaff(questionId, body, audit({ action: "question.answer", entity: "product_questions", summary: "Trả lời câu hỏi sản phẩm" }));
  if (!answered) return { message: "Câu hỏi đã bị ẩn hoặc không còn tồn tại." };
  await notifyQuestionAnswered({ ...answered, answer: body });
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: "Đã trả lời." };
}

export async function moderateQuestionAction(id: string, status: "approved" | "hidden"): Promise<FormState> {
  const audit = await staffWith("reviews.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || (status !== "approved" && status !== "hidden")) return { message: "Yêu cầu không hợp lệ." };
  const changed = await setQuestionStatus(id, status, audit({ action: `question.${status === "approved" ? "approve" : "hide"}`, entity: "product_questions", summary: status === "approved" ? "Hiện câu hỏi" : "Ẩn câu hỏi" }));
  if (!changed) return { message: "Câu hỏi đã ở trạng thái này." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}

export async function moderateAnswerAction(id: string, status: "approved" | "hidden"): Promise<FormState> {
  const audit = await staffWith("reviews.moderate");
  if (!audit) return FORBIDDEN;
  if (!isId(id) || (status !== "approved" && status !== "hidden")) return { message: "Yêu cầu không hợp lệ." };
  const changed = await setAnswerStatus(id, status, audit({ action: `answer.${status === "approved" ? "approve" : "hide"}`, entity: "product_answers", summary: status === "approved" ? "Hiện câu trả lời" : "Ẩn câu trả lời" }));
  if (!changed) return { message: "Câu trả lời đã ở trạng thái này." };
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true };
}
