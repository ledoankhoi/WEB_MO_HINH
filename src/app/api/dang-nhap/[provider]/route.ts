import { cookies, headers } from "next/headers";
import { site } from "@/config/site";
import { safeRedirectPath } from "@/lib/validation";
import { OAUTH_COOKIE, authorizationUrl, isOAuthProvider, newAuthRequest, oauthConfig } from "@/server/auth/oauth";
import { getCurrentUser } from "@/server/auth/session";
import { getBaseUrl } from "@/server/request";

// Bắt đầu đăng nhập bằng Google, Facebook (nghiep-vu-ban-hang mục 14): lưu state, PKCE verifier, trang quay về vào cookie
// httpOnly 10 phút rồi chuyển khách tới nhà cung cấp. `lien-ket=1` (đã đăng nhập): liên kết danh tính vào tài khoản hiện tại.
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const base = await getBaseUrl(site.url);
  if (!isOAuthProvider(provider)) return Response.redirect(`${base}/dang-nhap`, 302);
  const config = oauthConfig(provider);
  if (!config) return Response.redirect(`${base}/dang-nhap?loi=oauth_off`, 302);

  const link = url.searchParams.get("lien-ket") === "1" && (await getCurrentUser()) !== null;
  const next = safeRedirectPath(url.searchParams.get("next"), "/tai-khoan");
  const auth = newAuthRequest();
  const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
  (await cookies()).set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ provider, state: auth.state, verifier: auth.verifier, next, link })).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/api/dang-nhap",
    maxAge: 600,
  });
  const redirectUri = `${base}/api/dang-nhap/${provider}/callback`;
  return Response.redirect(authorizationUrl(provider, config, { state: auth.state, challenge: auth.challenge, redirectUri }), 302);
}
