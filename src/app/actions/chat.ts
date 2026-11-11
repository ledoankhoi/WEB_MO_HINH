"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { readText } from "@/lib/validation";
import { CHAT_MAX_LENGTH, postStaffMessage, setThreadStatus } from "@/server/repo/chat";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Nhân viên trả lời khách trong khung chat (nghiep-vu-ban-hang mục 16), quyền customers.manage.
export async function staffChatReplyAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  const threadId = readText(form, "threadId");
  const body = readText(form, "body");
  if (!isId(threadId)) return { message: "Yêu cầu không hợp lệ." };
  if (!body || body.length > CHAT_MAX_LENGTH) return { message: `Tin nhắn từ 1 đến ${CHAT_MAX_LENGTH} ký tự.`, values: { body } };
  const sent = await postStaffMessage(threadId, audit.user.id, body);
  if (!sent) return { message: "Cuộc trò chuyện không còn tồn tại." };
  refresh();
  return { ok: true };
}

export async function setChatStatusAction(threadId: string, status: "open" | "closed"): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  if (!isId(threadId) || (status !== "open" && status !== "closed")) return { message: "Yêu cầu không hợp lệ." };
  await setThreadStatus(threadId, status);
  refresh();
  return { ok: true };
}
