import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { CurrentUser } from "@/lib/types";
import { newToken, sha256 } from "../ids";
import { deleteSession, findSessionUser, insertSession } from "../repo/users";

const SESSION_COOKIE = "rs_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

// Cookie chỉ chứa token ngẫu nhiên; CSDL lưu SHA-256 của token. Gọi trong Server Action sau khi đã
// xác minh mật khẩu.
export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  await insertSession(sha256(token), userId, Date.now() + SESSION_TTL_SECONDS * 1000);

  // Bật cờ Secure khi yêu cầu đi qua HTTPS (reverse proxy cần chuyển tiếp X-Forwarded-Proto).
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(sha256(token));
  store.delete(SESSION_COOKIE);
}

export async function getSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? sha256(token) : null;
}

// Đọc cookie nên chỉ gọi được lúc xử lý yêu cầu: trong component nằm dưới <Suspense>, Server Action
// hoặc Route Handler. React.cache gộp các lần gọi trong cùng một yêu cầu thành một truy vấn.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  return findSessionUser(sha256(token));
});

export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/dang-nhap?next=${encodeURIComponent(returnTo)}`);
  return user;
}

// Người không phải quản trị viên nhận trang 404 để không lộ sự tồn tại của khu vực quản trị.
export async function requireAdmin(returnTo = "/admin"): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (user.role !== "admin") notFound();
  return user;
}
