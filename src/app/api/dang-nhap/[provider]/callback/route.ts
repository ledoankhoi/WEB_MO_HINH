import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { site } from "@/config/site";
import { safeRedirectPath } from "@/lib/validation";
import { OAUTH_COOKIE, fetchProfile, isOAuthProvider, oauthConfig, sameState } from "@/server/auth/oauth";
import { hashPassword } from "@/server/auth/password";
import { getCurrentUser, startSession } from "@/server/auth/session";
import { linkIdentity, resolveOAuthUser } from "@/server/repo/oauth";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getBaseUrl, getClientIp } from "@/server/request";

// Nhà cung cấp đưa khách quay về với `code` và `state`. Kiểm state với cookie (một lần), đổi code lấy hồ sơ ở máy chủ, rồi
// đăng nhập, tạo tài khoản hoặc liên kết (src/server/repo/oauth.ts). Lỗi thì về trang đăng nhập kèm mã lỗi (?loi=).
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const base = await getBaseUrl(site.url);
  const fail = (code: string, path = "/dang-nhap") => Response.redirect(`${base}${path}?loi=${code}`, 302);
  if (!isOAuthProvider(provider)) return fail("oauth_failed");
  const config = oauthConfig(provider);
  if (!config) return fail("oauth_off");

  const store = await cookies();
  const raw = store.get(OAUTH_COOKIE)?.value ?? "";
  store.delete({ name: OAUTH_COOKIE, path: "/api/dang-nhap" });
  let saved: { provider?: unknown; state?: unknown; verifier?: unknown; next?: unknown; link?: unknown } = {};
  try {
    saved = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return fail("oauth_failed");
  }
  const code = url.searchParams.get("code") ?? "";
  if (saved.provider !== provider || typeof saved.state !== "string" || typeof saved.verifier !== "string" || !code || !sameState(saved.state, url.searchParams.get("state") ?? "")) {
    return fail("oauth_failed");
  }
  const limit = await consumeRateLimit(`oauth:${await getClientIp()}`, 30, 15 * 60 * 1000);
  if (!limit.allowed) return fail("oauth_failed");

  const profile = await fetchProfile(provider, config, { code, verifier: saved.verifier, redirectUri: `${base}/api/dang-nhap/${provider}/callback` }).catch((error) => {
    console.error("[oauth] Không lấy được hồ sơ", provider, error);
    return null;
  });
  if (!profile) return fail("oauth_failed");

  // Liên kết từ Cài đặt: phải còn đăng nhập đúng tài khoản lúc bắt đầu.
  if (saved.link === true) {
    const user = await getCurrentUser();
    if (!user) return fail("oauth_failed");
    const linked = await linkIdentity(user.id, profile);
    return Response.redirect(`${base}/tai-khoan/cai-dat?muc=bao-mat&lien-ket=${linked === "ok" ? "ok" : "trung"}`, 302);
  }

  const outcome = await resolveOAuthUser(profile, await hashPassword(randomBytes(24).toString("base64url")));
  if (!outcome.ok) return fail(`oauth_${outcome.reason}`);
  await startSession(outcome.userId);
  return Response.redirect(`${base}${safeRedirectPath(typeof saved.next === "string" ? saved.next : null, "/tai-khoan")}`, 302);
}
