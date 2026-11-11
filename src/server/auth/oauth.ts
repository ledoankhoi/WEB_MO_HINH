import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Đăng nhập Google, Facebook (nghiep-vu-ban-hang mục 14): luồng authorization code. `state` chống giả mạo yêu cầu (lưu ở
// cookie httpOnly, so khi quay về); Google dùng thêm PKCE. Chưa có khoá ứng dụng thì nhà cung cấp đó coi như tắt.
// Việc chủ dự án cần làm: tạo ứng dụng OAuth ở Google Cloud Console và Facebook for Developers, khai báo địa chỉ quay về
// `<NEXT_PUBLIC_SITE_URL>/api/dang-nhap/google/callback` và `.../facebook/callback`, đặt biến môi trường bên dưới.

export const OAUTH_PROVIDERS = ["google", "facebook"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const isOAuthProvider = (value: unknown): value is OAuthProvider => value === "google" || value === "facebook";

// Cookie giữ state, PKCE verifier, trang quay về trong lúc khách ở trang nhà cung cấp (chỉ gửi tới /api/dang-nhap).
export const OAUTH_COOKIE = "rs_oauth";

export const PROVIDER_LABELS: Record<OAuthProvider, string> = { google: "Google", facebook: "Facebook" };

type Config = { clientId: string; clientSecret: string };

export function oauthConfig(provider: OAuthProvider, env: Record<string, string | undefined> = process.env): Config | null {
  const [id, secret] = provider === "google" ? [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET] : [env.FACEBOOK_APP_ID, env.FACEBOOK_APP_SECRET];
  return id?.trim() && secret?.trim() ? { clientId: id.trim(), clientSecret: secret.trim() } : null;
}

export function enabledProviders(env: Record<string, string | undefined> = process.env): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((provider) => oauthConfig(provider, env));
}

const FACEBOOK_GRAPH = "https://graph.facebook.com/v19.0";

const base64url = (buffer: Buffer) => buffer.toString("base64url");

// Bộ giá trị một lần cho mỗi lượt đăng nhập: state và PKCE verifier (43 ký tự), challenge = SHA-256(verifier).
export function newAuthRequest(): { state: string; verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { state: base64url(randomBytes(24)), verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

export function sameState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function authorizationUrl(provider: OAuthProvider, config: Config, request: { state: string; challenge: string; redirectUri: string }): string {
  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: request.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: request.state,
      code_challenge: request.challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return url.toString();
  }
  const url = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: "email,public_profile",
    state: request.state,
  }).toString();
  return url.toString();
}

// Hồ sơ lấy từ nhà cung cấp. `emailVerified`: nhà cung cấp xác nhận email thuộc người dùng (chỉ Google trả rõ); chỉ khi đó
// mới được tự liên kết với tài khoản sẵn có cùng email.
export type OAuthProfile = { provider: OAuthProvider; subject: string; email: string; emailVerified: boolean; name: string };

export async function fetchProfile(
  provider: OAuthProvider,
  config: Config,
  input: { code: string; verifier: string; redirectUri: string },
  fetcher: typeof fetch = fetch,
): Promise<OAuthProfile | null> {
  const json = async (response: Response) => (response.ok ? ((await response.json()) as Record<string, unknown>) : null);
  if (provider === "google") {
    const token = await json(
      await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: input.code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: input.redirectUri,
          grant_type: "authorization_code",
          code_verifier: input.verifier,
        }).toString(),
      }),
    );
    if (typeof token?.access_token !== "string") return null;
    const info = await json(await fetcher("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } }));
    if (typeof info?.sub !== "string") return null;
    return {
      provider,
      subject: info.sub,
      email: typeof info.email === "string" ? info.email.toLowerCase() : "",
      emailVerified: info.email_verified === true,
      name: typeof info.name === "string" ? info.name : "",
    };
  }
  const tokenUrl = new URL(`${FACEBOOK_GRAPH}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: input.redirectUri, code: input.code }).toString();
  const token = await json(await fetcher(tokenUrl.toString()));
  if (typeof token?.access_token !== "string") return null;
  const meUrl = new URL(`${FACEBOOK_GRAPH}/me`);
  meUrl.search = new URLSearchParams({ fields: "id,name,email", access_token: token.access_token }).toString();
  const me = await json(await fetcher(meUrl.toString()));
  if (typeof me?.id !== "string") return null;
  return {
    provider,
    subject: me.id,
    email: typeof me.email === "string" ? me.email.toLowerCase() : "",
    // Facebook không trả trạng thái xác minh: không dùng email để nhận tài khoản sẵn có.
    emailVerified: false,
    name: typeof me.name === "string" ? me.name : "",
  };
}
