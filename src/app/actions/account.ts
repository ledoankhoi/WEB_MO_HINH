"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { DELETE_CONFIRM_PHRASE, isAddressLabel } from "@/lib/account";
import { isProvince } from "@/lib/catalog";
import type { FormState } from "@/lib/types";
import { normalizePhone, readText } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { endSession, getCurrentUser, getSessionId } from "@/server/auth/session";
import { newToken } from "@/server/ids";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/server/repo/addresses";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { anonymizeAccount, countOpenOrders, endOtherSessions, findPasswordHash, setMarketingConsent } from "@/server/repo/users";

// Cài đặt tài khoản khách (/tai-khoan/cai-dat). Mọi action tự kiểm tra phiên đăng nhập và dữ liệu đầu vào, chỉ đổi dữ
// liệu của chính tài khoản đang đăng nhập.

const MINUTE = 60 * 1000;
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9]{1,40}$/i.test(value);

async function currentUser(section: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/dang-nhap?next=${encodeURIComponent(`/tai-khoan/cai-dat?muc=${section}`)}`);
  return user;
}

// Sổ địa chỉ: thêm (không có `id`) hoặc sửa một địa chỉ.
export async function saveAddressAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser("dia-chi");
  const id = readText(form, "id");
  const label = readText(form, "label");
  const recipientName = readText(form, "recipientName");
  const phoneInput = readText(form, "phone");
  const address = readText(form, "address");
  const city = readText(form, "city");
  const makeDefault = form.get("isDefault") === "on";
  const values = { id, label, recipientName, phone: phoneInput, address, city };

  const errors: Record<string, string> = {};
  if (id && !isId(id)) return { message: "Yêu cầu không hợp lệ." };
  if (!isAddressLabel(label)) errors.label = "Vui lòng chọn loại địa chỉ.";
  if (recipientName.length < 2 || recipientName.length > 80) errors.recipientName = "Tên người nhận cần từ 2 đến 80 ký tự.";
  const phone = normalizePhone(phoneInput);
  if (!phone) errors.phone = "Số điện thoại không hợp lệ.";
  if (address.length < 5 || address.length > 200) errors.address = "Địa chỉ cần từ 5 đến 200 ký tự (số nhà, đường, phường/xã).";
  if (!isProvince(city)) errors.city = "Vui lòng chọn tỉnh, thành phố trong danh sách.";
  if (Object.keys(errors).length > 0 || !isAddressLabel(label) || !phone) return { errors, values };

  const result = await saveAddress(user.id, id || null, { label, recipientName, phone, address, city }, makeDefault);
  if (result === "not_found") return { message: "Địa chỉ này không còn trong sổ.", values };
  if (result === "limit") return { message: "Sổ địa chỉ đã đầy. Hãy xoá bớt địa chỉ không dùng.", values };
  refresh();
  return { ok: true, message: id ? "Đã lưu địa chỉ." : "Đã thêm địa chỉ." };
}

export async function setDefaultAddressAction(id: string): Promise<FormState> {
  const user = await currentUser("dia-chi");
  if (!isId(id) || !(await setDefaultAddress(user.id, id))) return { message: "Địa chỉ này không còn trong sổ." };
  refresh();
  return { ok: true, message: "Đã đặt làm địa chỉ mặc định." };
}

export async function deleteAddressAction(id: string): Promise<FormState> {
  const user = await currentUser("dia-chi");
  if (!isId(id) || !(await deleteAddress(user.id, id))) return { message: "Địa chỉ này không còn trong sổ." };
  refresh();
  return { ok: true, message: "Đã xoá địa chỉ." };
}

// Thông báo: đồng ý nhận tin khuyến mãi, hàng mới qua email (YC-KH-04).
export async function updateNotificationsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser("thong-bao");
  await setMarketingConsent(user.id, form.get("marketingConsent") === "on");
  refresh();
  return { ok: true, message: "Đã lưu cài đặt thông báo." };
}

// Đăng xuất khỏi mọi thiết bị khác, giữ thiết bị đang dùng.
export async function logoutOtherDevicesAction(): Promise<FormState> {
  const user = await currentUser("bao-mat");
  const removed = await endOtherSessions(user.id, await getSessionId());
  refresh();
  return { ok: true, message: removed > 0 ? `Đã đăng xuất ${removed} thiết bị khác.` : "Không có thiết bị nào khác đang đăng nhập." };
}

// Xoá tài khoản: xác minh bằng mật khẩu và gõ lại câu xác nhận; từ chối khi còn đơn đang xử lý (như Shopee). Thành
// công thì xoá phiên hiện tại; trình duyệt tự chuyển về trang chủ.
export async function deleteAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await currentUser("rieng-tu");
  const password = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const phrase = readText(form, "confirm");

  const errors: Record<string, string> = {};
  if (!password) errors.password = "Nhập mật khẩu để xác minh.";
  if (phrase !== DELETE_CONFIRM_PHRASE) errors.confirm = `Gõ đúng "${DELETE_CONFIRM_PHRASE}" để xác nhận.`;
  if (Object.keys(errors).length > 0) return { errors };

  const limit = await consumeRateLimit(`delete-account:${user.id}`, 5, 15 * MINUTE);
  if (!limit.allowed) return { message: `Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ${Math.ceil(limit.retryAfterSeconds / 60)} phút.` };

  const storedHash = await findPasswordHash(user.id);
  if (!storedHash || !(await verifyPassword(password, storedHash))) return { errors: { password: "Mật khẩu không đúng." } };

  const open = await countOpenOrders(user.id);
  if (open > 0) {
    return { message: `Bạn còn ${open} đơn hàng đang xử lý. Tài khoản chỉ xoá được khi mọi đơn đã hoàn tất hoặc đã huỷ.` };
  }

  await anonymizeAccount(user.id, await hashPassword(newToken()));
  await endSession();
  return { ok: true, message: "Tài khoản đã được xoá." };
}
