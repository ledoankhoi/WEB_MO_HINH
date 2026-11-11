import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const oauth = await import("@/server/auth/oauth");
const repo = await import("@/server/repo/oauth");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

const config = { clientId: "id-thu", clientSecret: "bi-mat" };
const profile = (overrides: Partial<Parameters<typeof repo.resolveOAuthUser>[0]> = {}) => ({
  provider: "google" as const,
  subject: `g-${Math.random()}`,
  email: `khach${Math.random().toString(36).slice(2, 8)}@example.com`,
  emailVerified: true,
  name: "Khách Google",
  ...overrides,
});

describe("luồng OAuth", () => {
  it("chỉ bật nhà cung cấp có đủ khoá; URL Google có state và PKCE S256", () => {
    expect(oauth.enabledProviders({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" })).toEqual(["google"]);
    expect(oauth.enabledProviders({ FACEBOOK_APP_ID: "a" })).toEqual([]);
    const request = oauth.newAuthRequest();
    expect(request.challenge).toBe(createHash("sha256").update(request.verifier).digest("base64url"));
    const url = new URL(oauth.authorizationUrl("google", config, { state: request.state, challenge: request.challenge, redirectUri: "https://shop.vn/cb" }));
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("https://shop.vn/cb");
    expect(oauth.sameState(request.state, request.state)).toBe(true);
    expect(oauth.sameState(request.state, `${request.state}x`)).toBe(false);
    expect(oauth.sameState("", "")).toBe(false);
  });

  it("đổi code lấy hồ sơ: Google trả email đã xác minh, Facebook không coi là đã xác minh", async () => {
    const calls: string[] = [];
    const fake = (responses: Record<string, unknown>) =>
      (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
        const key = Object.keys(responses).find((k) => url.includes(k));
        return new Response(JSON.stringify(key ? responses[key] : {}), { status: key ? 200 : 400 });
      }) as typeof fetch;
    const google = await oauth.fetchProfile(
      "google",
      config,
      { code: "c", verifier: "v", redirectUri: "https://shop.vn/cb" },
      fake({ "oauth2.googleapis.com/token": { access_token: "t" }, userinfo: { sub: "123", email: "A@Example.com", email_verified: true, name: "An" } }),
    );
    expect(google).toEqual({ provider: "google", subject: "123", email: "a@example.com", emailVerified: true, name: "An" });
    const facebook = await oauth.fetchProfile(
      "facebook",
      config,
      { code: "c", verifier: "v", redirectUri: "https://shop.vn/cb" },
      fake({ "oauth/access_token": { access_token: "t" }, "/me": { id: "9", email: "b@example.com", name: "Bình" } }),
    );
    expect(facebook).toMatchObject({ subject: "9", email: "b@example.com", emailVerified: false });
    expect(await oauth.fetchProfile("google", config, { code: "c", verifier: "v", redirectUri: "x" }, fake({}))).toBeNull();
    expect(calls[0]).toBe("POST https://oauth2.googleapis.com/token");
  });
});

describe("chọn tài khoản", () => {
  it("lần đầu tạo tài khoản khách và liên kết; lần sau đăng nhập đúng tài khoản đó", async () => {
    const p = profile();
    const first = await repo.resolveOAuthUser(p, "hash");
    expect(first).toMatchObject({ ok: true, created: true });
    const again = await repo.resolveOAuthUser(p, "hash");
    expect(again).toEqual({ ok: true, userId: first.ok ? first.userId : "", created: false });
    expect((await repo.listIdentities(first.ok ? first.userId : "")).map((i) => i.provider)).toEqual(["google"]);
  });

  it("email trùng tài khoản sẵn có: Google (đã xác minh) tự liên kết, Facebook phải đăng nhập rồi liên kết ở Cài đặt", async () => {
    const existing = await createUser("customer");
    const viaGoogle = await repo.resolveOAuthUser(profile({ email: existing.email }), "hash");
    expect(viaGoogle).toEqual({ ok: true, userId: existing.id, created: false });

    const other = await createUser("customer");
    const viaFacebook = profile({ provider: "facebook", email: other.email, emailVerified: false });
    expect(await repo.resolveOAuthUser(viaFacebook, "hash")).toEqual({ ok: false, reason: "email_taken" });
    expect(await repo.linkIdentity(other.id, viaFacebook)).toBe("ok");
    expect(await repo.resolveOAuthUser(viaFacebook, "hash")).toEqual({ ok: true, userId: other.id, created: false });
    // Cùng danh tính không gắn được vào tài khoản thứ hai.
    expect(await repo.linkIdentity(existing.id, viaFacebook)).toBe("linked_elsewhere");
  });

  it("không nhận tài khoản nhân viên, tài khoản bị khoá, hồ sơ không có email", async () => {
    const staff = await createUser("order_staff");
    expect(await repo.resolveOAuthUser(profile({ email: staff.email }), "hash")).toEqual({ ok: false, reason: "staff" });
    const locked = await createUser("customer");
    const db = await getDb();
    await db.execute({ sql: "UPDATE users SET is_active = false WHERE id = ?", args: [locked.id] });
    expect(await repo.resolveOAuthUser(profile({ email: locked.email }), "hash")).toEqual({ ok: false, reason: "locked" });
    expect(await repo.resolveOAuthUser(profile({ email: "" }), "hash")).toEqual({ ok: false, reason: "no_email" });
  });
});
