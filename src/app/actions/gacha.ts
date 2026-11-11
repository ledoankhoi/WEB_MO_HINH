"use server";

import { getSeries, isPullMode, type PullResult } from "@/lib/gacha";
import { getCurrentUser } from "@/server/auth/session";
import { claimSetReward, craft, openAllBoxes, openBox, pull } from "@/server/repo/gacha";
import { consumeRateLimit } from "@/server/repo/rate-limit";

// Gacha (/gacha): chỉ trả bằng xu. Kết quả do máy chủ quay (crypto.randomInt), trình duyệt chỉ hiển thị. Không gọi
// refresh(): trang tự làm mới sau khi hoạt ảnh mở thẻ chạy xong, để bộ sưu tập không lộ thẻ mới trước khi khách lật.

export type PullActionResult = { ok: true; results: PullResult[]; balance: number; shards: number } | { ok: false; message: string };

// mode: "single" (1 lượt), "ten" (10 lượt), "free" (lượt miễn phí hôm nay), "pack" (gói 5 thẻ).
export async function pullAction(mode: unknown, seriesKey: unknown = "s1"): Promise<PullActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Đăng nhập để chơi gacha." };
  if (!isPullMode(mode)) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const limit = await consumeRateLimit(`gacha:${user.id}`, 30, 60 * 1000);
  if (!limit.allowed) return { ok: false, message: "Bạn quay nhanh quá, nghỉ tay một chút nhé." };
  const series = getSeries(seriesKey);
  if (!series) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const outcome = await pull(user.id, mode, undefined, series);
  if (!outcome.ok) {
    return {
      ok: false,
      message: outcome.reason === "free_used" ? "Hôm nay bạn đã dùng lượt miễn phí. Mai quay tiếp nhé!" : "Không đủ xu. Làm nhiệm vụ để nhận thêm xu nhé!",
    };
  }
  return outcome;
}

export type CraftActionResult = { ok: true; result: PullResult; shards: number } | { ok: false; message: string };

export async function craftAction(card: unknown): Promise<CraftActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Đăng nhập để ghép thẻ." };
  if (typeof card !== "string" || card.length > 20) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const limit = await consumeRateLimit(`gacha-craft:${user.id}`, 30, 60 * 1000);
  if (!limit.allowed) return { ok: false, message: "Bạn thao tác nhanh quá, nghỉ tay một chút nhé." };
  const outcome = await craft(user.id, card);
  if (!outcome.ok) {
    const messages = {
      invalid: "Chỉ ghép được thẻ Thường và thẻ Hiếm.",
      owned: "Bạn đã có thẻ này rồi.",
      not_enough_shards: "Chưa đủ mảnh ghép.",
    } as const;
    return { ok: false, message: messages[outcome.reason] };
  }
  return outcome;
}

export type BoxActionResult =
  | { ok: true; result: PullResult; slot: number; balance: number; shards: number; finished: boolean }
  | { ok: false; message: string };

// Mở một hộp trên kệ hộp mù (slot 0–11).
export async function openBoxAction(slot: unknown, seriesKey: unknown = "s1"): Promise<BoxActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Đăng nhập để mở hộp mù." };
  if (typeof slot !== "number") return { ok: false, message: "Yêu cầu không hợp lệ." };
  const limit = await consumeRateLimit(`gacha:${user.id}`, 30, 60 * 1000);
  if (!limit.allowed) return { ok: false, message: "Bạn mở nhanh quá, nghỉ tay một chút nhé." };
  const series = getSeries(seriesKey);
  if (!series) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const outcome = await openBox(user.id, slot, undefined, series);
  if (!outcome.ok) {
    const messages = {
      invalid: "Yêu cầu không hợp lệ.",
      opened: "Hộp này đã mở rồi.",
      not_enough_coins: "Không đủ xu. Làm nhiệm vụ để nhận thêm xu nhé!",
    } as const;
    return { ok: false, message: messages[outcome.reason] };
  }
  return outcome;
}

export type BoxBatchActionResult =
  | { ok: true; results: (PullResult & { slot: number })[]; balance: number; shards: number; finished: boolean }
  | { ok: false; message: string };

// Mua và mở một lúc mọi hộp còn niêm phong trên kệ hộp mù.
export async function openAllBoxesAction(seriesKey: unknown = "s1"): Promise<BoxBatchActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Đăng nhập để mở hộp mù." };
  const limit = await consumeRateLimit(`gacha:${user.id}`, 30, 60 * 1000);
  if (!limit.allowed) return { ok: false, message: "Bạn mở nhanh quá, nghỉ tay một chút nhé." };
  const series = getSeries(seriesKey);
  if (!series) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const outcome = await openAllBoxes(user.id, undefined, series);
  if (!outcome.ok) {
    const messages = {
      invalid: "Kệ đang được xếp lại, bấm lại sau giây lát nhé.",
      changed: "Kệ vừa thay đổi, bấm lại để mua các hộp còn lại.",
      not_enough_coins: "Không đủ xu để mua cả kệ. Làm nhiệm vụ để nhận thêm xu nhé!",
    } as const;
    return { ok: false, message: messages[outcome.reason] };
  }
  return outcome;
}

export async function claimSetAction(seriesKey: unknown = "s1"): Promise<{ ok: boolean; message: string; code?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Đăng nhập để nhận thưởng." };
  const series = getSeries(seriesKey);
  if (!series) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const outcome = await claimSetReward(user.id, series);
  if (outcome.status === "ok") return { ok: true, message: "Chúc mừng! Bạn đã gom đủ bộ.", code: outcome.code };
  return { ok: false, message: outcome.status === "claimed" ? "Bạn đã nhận thưởng đủ bộ rồi." : "Bộ sưu tập chưa đủ thẻ." };
}
