"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { isOAuthProvider } from "@/server/auth/oauth";
import { getCurrentUser } from "@/server/auth/session";
import { unlinkIdentity } from "@/server/repo/oauth";

// Bỏ liên kết Google, Facebook khỏi tài khoản đang đăng nhập. Tài khoản vẫn đăng nhập bằng email được (đặt mật khẩu qua
// "Quên mật khẩu" nếu tài khoản được tạo bằng mạng xã hội).
export async function unlinkIdentityAction(provider: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập lại." };
  if (!isOAuthProvider(provider)) return { message: "Yêu cầu không hợp lệ." };
  const removed = await unlinkIdentity(user.id, provider);
  refresh();
  return removed ? { ok: true } : { message: "Tài khoản chưa liên kết." };
}
