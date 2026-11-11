"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/types";
import { isEmail, readText, safeRedirectPath } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/session";
import { sendOtpMail } from "@/server/email/otp-mails";
import { OTP_MESSAGES, checkOtp, consumeOtp, issueOtp, markEmailVerified } from "@/server/repo/otp";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

const HOUR = 3600 * 1000;

// Gửi (lại) mã xác thực tới email của tài khoản đang đăng nhập.
export async function sendVerifyEmailOtpAction(): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập lại." };
  if (user.emailVerified) return { ok: true, message: "Email đã được xác thực." };
  const limit = await consumeRateLimit(`otp-verify:${user.id}`, 8, HOUR);
  if (!limit.allowed) return { message: "Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau." };
  const issued = await issueOtp("verify_email", user.email);
  if (!issued.ok) return { message: `Vui lòng đợi ${issued.retryAfterSeconds} giây rồi gửi lại.` };
  await sendOtpMail(user.email, issued.code, "verify_email");
  return { ok: true, message: `Đã gửi mã tới ${user.email}.` };
}

export async function verifyEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { message: "Vui lòng đăng nhập lại." };
  const next = safeRedirectPath(readText(form, "next"), "/tai-khoan");
  if (user.emailVerified) redirect(next);
  const code = readText(form, "code").replace(/\s+/g, "");
  const check = await checkOtp("verify_email", user.email, code);
  if (!check.ok) return { errors: { code: OTP_MESSAGES[check.reason] } };
  await consumeOtp(check.id);
  await markEmailVerified(user.id);
  redirect(next);
}

// Gửi mã xác nhận đơn COD giá trị lớn tới email khách nhập ở trang thanh toán (khách vãng lai cũng dùng được).
export async function sendOrderOtpAction(email: string): Promise<FormState> {
  const target = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!isEmail(target)) return { message: "Nhập email hợp lệ để nhận mã xác nhận." };
  const ip = await getClientIp();
  const [byIp, byEmail] = await Promise.all([consumeRateLimit(`otp-order-ip:${ip}`, 10, HOUR), consumeRateLimit(`otp-order:${target}`, 6, HOUR)]);
  if (!byIp.allowed || !byEmail.allowed) return { message: "Bạn yêu cầu mã quá nhiều lần. Vui lòng thử lại sau." };
  const issued = await issueOtp("cod_order", target);
  if (!issued.ok) return { message: `Vui lòng đợi ${issued.retryAfterSeconds} giây rồi gửi lại.` };
  await sendOtpMail(target, issued.code, "cod_order");
  return { ok: true, message: `Đã gửi mã tới ${target}. Mã có hiệu lực 10 phút.` };
}
