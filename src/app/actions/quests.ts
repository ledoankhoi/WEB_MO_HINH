"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { getCurrentUser } from "@/server/auth/session";
import { checkIn, claimReward, markComicRead } from "@/server/repo/quests";

// Xu và nhiệm vụ (/nhiem-vu). Chỉ khách đã đăng nhập; điều kiện nhận thưởng do máy chủ tính lại.

const isRef = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9-]{1,60}$/i.test(value);
const LOGIN: FormState = { message: "Đăng nhập để nhận xu." };

export async function checkInAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  const { amount, streak } = await checkIn(user.id);
  refresh();
  if (amount === 0) return { message: "Hôm nay bạn đã điểm danh rồi. Hẹn gặp lại ngày mai!" };
  return { ok: true, message: `Điểm danh thành công: +${amount} xu (chuỗi ${streak} ngày).` };
}

export async function claimRewardAction(kind: string, ref: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return LOGIN;
  if ((kind !== "quest" && kind !== "comic" && kind !== "order") || !isRef(ref)) return { message: "Yêu cầu không hợp lệ." };
  const result = await claimReward(user.id, kind, ref);
  refresh();
  if (result.ok) return { ok: true, message: `Đã nhận +${result.amount} xu.` };
  return { message: result.reason === "claimed" ? "Phần thưởng này đã nhận rồi." : result.reason === "not_ready" ? "Nhiệm vụ chưa hoàn thành." : "Không tìm thấy phần thưởng." };
}

// Gọi khi khách đọc tới khung cuối của chương. Khách chưa đăng nhập thì bỏ qua.
export async function markComicReadAction(chapter: string): Promise<{ recorded: boolean }> {
  const user = await getCurrentUser();
  if (!user || !isRef(chapter)) return { recorded: false };
  return { recorded: await markComicRead(user.id, chapter) };
}
