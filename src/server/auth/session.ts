import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CurrentUser } from "@/lib/types";
import { newToken, sha256 } from "../ids";
import { deleteSession, findSessionUser, insertSession } from "../repo/users";

const SESSION_COOKIE = "rs_session";
// Khu quản trị có phiên đăng nhập riêng. Trình duyệt chỉ gửi cookie này kèm yêu cầu tới /admin, nên
// đăng nhập ở cửa hàng không mở được khu quản trị và đăng nhập quản trị không đăng nhập vào cửa hàng.
const ADMIN_COOKIE = "rs_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

const cookieFor = (admin: boolean) => (admin ? { name: ADMIN_COOKIE, path: "/admin" } : { name: SESSION_COOKIE, path: "/" });

// Cookie chỉ chứa token ngẫu nhiên; CSDL lưu SHA-256 của token. Gọi trong Server Action sau khi đã
// xác minh mật khẩu.
export async function startSession(userId: string, admin = false): Promise<void> {
  const token = newToken();
  await insertSession(sha256(token), userId, Date.now() + SESSION_TTL_SECONDS * 1000);

  // Bật cờ Secure khi yêu cầu đi qua HTTPS (reverse proxy cần chuyển tiếp X-Forwarded-Proto).
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(cookieFor(admin).name, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: cookieFor(admin).path,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(admin = false): Promise<void> {
  const store = await cookies();
  const token = store.get(cookieFor(admin).name)?.value;
  if (token) await deleteSession(sha256(token));
  // Phải xoá đúng đường dẫn đã đặt, nếu không trình duyệt vẫn giữ cookie.
  store.delete(cookieFor(admin));
}

export async function getSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

// Đọc cookie nên chỉ gọi được lúc xử lý yêu cầu: trong component nằm dưới <Suspense>, Server Action
// hoặc Route Handler. React.cache gộp các lần gọi trong cùng một yêu cầu thành một truy vấn.
const readUser = cache(async (cookie: string): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(cookie)?.value;
  if (!token || token.length > 128) return null;
  return findSessionUser(sha256(token));
});

export const getCurrentUser = () => readUser(SESSION_COOKIE);

// Kiểm tra vai trò ở mỗi yêu cầu: tài khoản bị hạ quyền sau khi đăng nhập mất quyền ngay.
export async function getAdminUser(): Promise<CurrentUser | null> {
  const user = await readUser(ADMIN_COOKIE);
  return user?.role === "admin" ? user : null;
}

export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/dang-nhap?next=${encodeURIComponent(returnTo)}`);
  return user;
}

// Ai chưa có phiên quản trị (kể cả khách đang đăng nhập ở cửa hàng) đều về trang đăng nhập quản trị.
export async function requireAdmin(returnTo = "/admin"): Promise<CurrentUser> {
  const user = await getAdminUser();
  if (!user) redirect(`/admin/dang-nhap?next=${encodeURIComponent(returnTo)}`);
  return user;
}
