"use server";

import { redirect } from "next/navigation";
import { isProvince } from "@/lib/catalog";
import { isStaffRole } from "@/lib/permissions";
import type { FormState } from "@/lib/types";
import { isEmail, normalizePhone, readText, safeRedirectPath } from "@/lib/validation";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isValidPassword,
  verifyPassword,
} from "@/server/auth/password";
import { endSession, getCurrentUser, getSessionId, startSession } from "@/server/auth/session";
import { isConstraintError } from "@/server/db";
import { writeAudit } from "@/server/repo/audit";
import { consumeRateLimit, resetRateLimit } from "@/server/repo/rate-limit";
import {
  findCredentialsByEmail,
  findPasswordHash,
  insertUser,
  updateUserPassword,
  updateUserProfile,
} from "@/server/repo/users";
import { getClientIp } from "@/server/request";

const MINUTE = 60 * 1000;
const PASSWORD_RULE = `Mật khẩu cần từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_LENGTH} ký tự.`;
const TOO_MANY = (seconds: number) =>
  `Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(seconds / 60)} phút.`;

// Mật khẩu không được cắt khoảng trắng như các ô khác.
function readPassword(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

// Băm sẵn một mật khẩu giả để lần đăng nhập với email không tồn tại cũng tốn thời gian tương đương,
// tránh lộ email nào đã đăng ký qua độ trễ phản hồi.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("mat-khau-gia-de-can-bang-thoi-gian"));

export async function registerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const name = readText(form, "name");
  const email = readText(form, "email").toLowerCase();
  const phoneInput = readText(form, "phone");
  const password = readPassword(form, "password");
  const confirm = readPassword(form, "confirm");
  const next = safeRedirectPath(readText(form, "next"), "/tai-khoan");
  const values = { name, email, phone: phoneInput };

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Họ tên cần từ 2 đến 80 ký tự.";
  if (!isEmail(email)) errors.email = "Email không hợp lệ.";
  const phone = phoneInput ? normalizePhone(phoneInput) : "";
  if (phone === null) errors.phone = "Số điện thoại không hợp lệ.";
  if (!isValidPassword(password)) errors.password = PASSWORD_RULE;
  else if (password !== confirm) errors.confirm = "Mật khẩu nhập lại không khớp.";
  if (Object.keys(errors).length > 0) return { errors, values };

  const limit = await consumeRateLimit(`register:${await getClientIp()}`, 10, 60 * MINUTE);
  if (!limit.allowed) return { message: TOO_MANY(limit.retryAfterSeconds), values };

  let userId: string;
  try {
    userId = await insertUser({ email, name, phone: phone ?? "", passwordHash: await hashPassword(password) });
  } catch (error) {
    if (isConstraintError(error)) return { errors: { email: "Email này đã được đăng ký." }, values };
    throw error;
  }

  await startSession(userId);
  redirect(next);
}

// Hai cửa đăng nhập tách biệt: cửa hàng chỉ nhận tài khoản khách, khu quản trị chỉ nhận nhân viên; cả hai
// chỉ nhận tài khoản đang hoạt động. Vào sai cửa hoặc tài khoản bị khoá nhận cùng một thông báo như sai
// mật khẩu, để không lộ tài khoản nào là nhân viên. Mọi lần đăng nhập quản trị đều ghi nhật ký.
async function signIn(form: FormData, admin: boolean): Promise<FormState> {
  const email = readText(form, "email").toLowerCase();
  const password = readPassword(form, "password");
  const next = safeRedirectPath(readText(form, "next"), admin ? "/admin" : "/tai-khoan");
  const values = { email };

  if (!isEmail(email) || password.length === 0) {
    return { message: "Vui lòng nhập email và mật khẩu.", values };
  }

  // Giới hạn theo từng email (chống dò mật khẩu một tài khoản) và theo IP (chống dò nhiều tài khoản).
  const emailKey = `login:${email}`;
  const [byEmail, byIp] = await Promise.all([
    consumeRateLimit(emailKey, 8, 15 * MINUTE),
    consumeRateLimit(`login-ip:${await getClientIp()}`, 40, 15 * MINUTE),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return { message: TOO_MANY(Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds)), values };
  }

  const credentials = await findCredentialsByEmail(email);
  const valid = await verifyPassword(password, credentials?.passwordHash ?? (await getDummyHash()));
  const allowed =
    credentials && valid && credentials.isActive && (admin ? isStaffRole(credentials.role) : credentials.role === "customer");
  if (!allowed) {
    if (admin) {
      await writeAudit({
        actor: { id: null, role: "" },
        action: "auth.admin_login_failed",
        entity: "users",
        entityId: credentials?.id,
        summary: `Đăng nhập quản trị thất bại với email ${email}`,
      });
    }
    return { message: "Email hoặc mật khẩu không đúng.", values };
  }

  if (admin) {
    await writeAudit({
      actor: { id: credentials.id, role: credentials.role },
      action: "auth.admin_login",
      entity: "users",
      entityId: credentials.id,
      summary: `Đăng nhập quản trị với email ${email}`,
    });
  }
  await resetRateLimit(emailKey);
  await startSession(credentials.id, admin);
  redirect(next);
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  return signIn(form, false);
}

export async function adminLoginAction(_prev: FormState, form: FormData): Promise<FormState> {
  return signIn(form, true);
}

// Không chuyển hướng ở đây: phía trình duyệt sẽ tải lại toàn bộ trang để xoá mọi trạng thái còn giữ
// của tài khoản vừa đăng xuất.
export async function logoutAction(): Promise<void> {
  await endSession();
}

export async function adminLogoutAction(): Promise<void> {
  await endSession(true);
}

export async function updateProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/dang-nhap?next=/tai-khoan");

  const name = readText(form, "name");
  const phoneInput = readText(form, "phone");
  const address = readText(form, "address");
  const city = readText(form, "city");
  const values = { name, phone: phoneInput, address, city };

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Họ tên cần từ 2 đến 80 ký tự.";
  const phone = phoneInput ? normalizePhone(phoneInput) : "";
  if (phone === null) errors.phone = "Số điện thoại không hợp lệ.";
  if (address.length > 200) errors.address = "Địa chỉ tối đa 200 ký tự.";
  if (city && !isProvince(city)) errors.city = "Vui lòng chọn tỉnh, thành phố trong danh sách.";
  if (Object.keys(errors).length > 0) return { errors, values };

  await updateUserProfile(user.id, { name, phone: phone ?? "", address, city });
  return { ok: true, message: "Đã lưu thông tin tài khoản.", values };
}

export async function changePasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/dang-nhap?next=/tai-khoan");

  const current = readPassword(form, "current");
  const password = readPassword(form, "password");
  const confirm = readPassword(form, "confirm");

  const errors: Record<string, string> = {};
  if (!isValidPassword(password)) errors.password = PASSWORD_RULE;
  else if (password !== confirm) errors.confirm = "Mật khẩu nhập lại không khớp.";
  if (Object.keys(errors).length > 0) return { errors };

  const limit = await consumeRateLimit(`password:${user.id}`, 8, 15 * MINUTE);
  if (!limit.allowed) return { message: TOO_MANY(limit.retryAfterSeconds) };

  const storedHash = await findPasswordHash(user.id);
  if (!storedHash || !(await verifyPassword(current, storedHash))) {
    return { errors: { current: "Mật khẩu hiện tại không đúng." } };
  }

  await updateUserPassword(user.id, await hashPassword(password), await getSessionId());
  return { ok: true, message: "Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất." };
}
