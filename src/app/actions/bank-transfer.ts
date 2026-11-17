"use server";

import { refresh } from "next/cache";
import { TRANSFER_NOTE_MAX } from "@/lib/bank-transfer";
import { amountDue, onlinePayable } from "@/lib/preorder";
import type { FormState } from "@/lib/types";
import { claimTransfer, countRecentClaims } from "@/server/repo/bank-transfers";
import { findOrderByToken } from "@/server/repo/orders";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

const HOUR = 60 * 60 * 1000;

// Khách báo "Tôi đã chuyển khoản" ở trang đơn. Liên kết đơn (token) là bằng chứng chủ đơn. Chỉ là lời báo cho kế toán đối
// chiếu sổ ngân hàng: không đổi trạng thái thanh toán. Đơn đã báo thì không bị tự huỷ khi quá hạn giữ hàng.
export async function claimTransferAction(token: string, note: unknown): Promise<FormState> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return { message: "Yêu cầu không hợp lệ." };
  const text = typeof note === "string" ? note.trim().slice(0, TRANSFER_NOTE_MAX) : "";
  const limit = await consumeRateLimit(`transfer-claim:${await getClientIp()}`, 10, HOUR);
  if (!limit.allowed) return { message: "Bạn đã báo quá nhiều lần. Vui lòng thử lại sau." };
  const order = await findOrderByToken(token);
  const transferDue =
    !!order &&
    onlinePayable(order) &&
    amountDue(order) > 0 &&
    (order.paymentMethod === "bank" || (order.paymentMethod === "cod" && order.paymentStatus === "unpaid" && order.depositAmount > 0));
  if (!order || !transferDue) return { message: "Đơn này không còn chờ chuyển khoản." };
  if ((await countRecentClaims(order.id, Date.now() - HOUR)) >= 3) return { message: "Cửa hàng đã nhận được báo của bạn, vui lòng chờ kiểm tra." };
  await claimTransfer(order.id, text);
  refresh();
  return { ok: true, message: "Đã báo cửa hàng. Kế toán sẽ đối chiếu và xác nhận trong giờ làm việc." };
}
