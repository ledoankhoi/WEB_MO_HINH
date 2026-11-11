import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// Quên mật khẩu và hộp thư đi (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 1–2).

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
const requestHeaders = new Headers({ host: "localhost:3000" });
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (options: string | { name: string }) => jar.delete(typeof options === "string" ? options : options.name),
  }),
  headers: async () => requestHeaders,
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { formOf } = await import("./helpers/staff");
const { newId, sha256 } = await import("@/server/ids");
const { hashPassword, verifyPassword } = await import("@/server/auth/password");
const auth = await import("@/app/actions/auth");
const { escapeHtml, layout } = await import("@/server/email/templates");
const { smtpConfig } = await import("@/server/email/mailer");
const { getBaseUrl } = await import("@/server/request");

const EMAIL = "quen@example.com";
let userId = "";

async function outbox() {
  const db = await getDb();
  return (await db.execute("SELECT to_email, kind, status, html, text_body FROM email_outbox ORDER BY created_at")).rows;
}

// Lấy token gốc từ liên kết trong thư gần nhất.
async function tokenFromLastMail(): Promise<string> {
  const rows = await outbox();
  const text = String(rows.at(-1)?.text_body ?? "");
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error("Thư không có token");
  return decodeURIComponent(match[1]);
}

beforeAll(async () => {
  const db = await getDb();
  userId = newId();
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'customer', ?)",
    args: [userId, EMAIL, "Khách Quên", await hashPassword("mat-khau-cu-123"), Date.now()],
  });
  await db.execute({ sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", args: ["phien-cu", userId, Date.now() + 3_600_000, Date.now()] });
});
afterAll(() => cleanup());

describe("mẫu thư và cấu hình", () => {
  it("mã hoá ký tự đặc biệt để tên khách không chèn được HTML vào thư", () => {
    expect(escapeHtml(`<b>"x"&'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
    const mail = layout({ title: "T", paragraphs: ["Chào <script>alert(1)</script>"], action: { label: "Mở", url: "https://a.vn/?x=1&y=2" } });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("https://a.vn/?x=1&amp;y=2");
    expect(mail.text).toContain("Mở: https://a.vn/?x=1&y=2");
  });

  it("chỉ coi là có SMTP khi đủ host, user, mật khẩu", () => {
    expect(smtpConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.c" })).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@b.c", SMTP_PASS: "x" })).toEqual({
      host: "smtp.gmail.com", port: 587, user: "a@b.c", pass: "x", from: "a@b.c",
    });
  });

  it("liên kết trong thư không tin header Host lạ (chống host header injection)", async () => {
    const before = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    requestHeaders.set("host", "attacker.example");
    expect(await getBaseUrl("https://robotica.vn")).toBe("https://robotica.vn");
    requestHeaders.set("host", "localhost:3000");
    expect(await getBaseUrl("https://robotica.vn")).toBe("http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = "https://shop.example/";
    expect(await getBaseUrl("x")).toBe("https://shop.example");
    if (before === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = before;
  });
});

describe("quên mật khẩu", () => {
  it("email không có tài khoản: cùng thông báo, không gửi thư", async () => {
    const result = await auth.requestPasswordResetAction({}, formOf({ email: "khong-co@example.com" }));
    expect(result.ok).toBe(true);
    expect((await outbox()).length).toBe(0);
  });

  it("email có tài khoản: gửi thư chứa liên kết; CSDL chỉ lưu SHA-256 của token", async () => {
    const result = await auth.requestPasswordResetAction({}, formOf({ email: EMAIL.toUpperCase() }));
    expect(result.ok).toBe(true);
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0].to_email).toBe(EMAIL);
    expect(rows[0].kind).toBe("password_reset");
    expect(rows[0].status).toBe("logged"); // chưa cấu hình SMTP trong test
    const token = await tokenFromLastMail();
    const db = await getDb();
    const stored = (await db.execute({ sql: "SELECT token_hash FROM password_resets WHERE user_id = ?", args: [userId] })).rows;
    expect(stored).toHaveLength(1);
    expect(stored[0].token_hash).toBe(sha256(token));
    expect(String(rows[0].text_body)).toContain("http://localhost:3000/dat-lai-mat-khau?token=");
  });

  it("yêu cầu lần nữa thì token cũ hết hiệu lực", async () => {
    const old = await tokenFromLastMail();
    await auth.requestPasswordResetAction({}, formOf({ email: EMAIL }));
    const fresh = await tokenFromLastMail();
    expect(fresh).not.toBe(old);
    const result = await auth.resetPasswordAction({}, formOf({ token: old, password: "mat-khau-moi-456", confirm: "mat-khau-moi-456" }));
    expect(result.message).toMatch(/không hợp lệ/);
  });

  it("đặt mật khẩu mới: đổi mật khẩu, xoá mọi phiên, báo bằng thư, token chỉ dùng một lần", async () => {
    const token = await tokenFromLastMail();
    const form = formOf({ token, password: "mat-khau-moi-456", confirm: "mat-khau-moi-456" });
    await expect(auth.resetPasswordAction({}, form)).rejects.toThrow("REDIRECT /dang-nhap?da-dat-lai=1");
    const db = await getDb();
    const hash = String((await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] })).rows[0].password_hash);
    expect(await verifyPassword("mat-khau-moi-456", hash)).toBe(true);
    expect((await db.execute({ sql: "SELECT 1 FROM sessions WHERE user_id = ?", args: [userId] })).rows).toHaveLength(0);
    expect((await outbox()).at(-1)?.kind).toBe("password_changed");
    const again = await auth.resetPasswordAction({}, formOf({ token, password: "mat-khau-khac-789", confirm: "mat-khau-khac-789" }));
    expect(again.message).toMatch(/không hợp lệ/);
  });

  it("token hết hạn thì không dùng được", async () => {
    await auth.requestPasswordResetAction({}, formOf({ email: EMAIL }));
    const token = await tokenFromLastMail();
    const db = await getDb();
    await db.execute({ sql: "UPDATE password_resets SET expires_at = 1 WHERE token_hash = ?", args: [sha256(token)] });
    const result = await auth.resetPasswordAction({}, formOf({ token, password: "mat-khau-moi-999", confirm: "mat-khau-moi-999" }));
    expect(result.message).toMatch(/hết hạn/);
  });

  it("kiểm tra mật khẩu mới trước khi dùng token", async () => {
    const result = await auth.resetPasswordAction({}, formOf({ token: "abc", password: "ngan", confirm: "ngan" }));
    expect(result.errors?.password).toBeTruthy();
  });

  it("giới hạn số lần yêu cầu theo email: lần thứ 4 trong một giờ không gửi thêm thư", async () => {
    const db = await getDb();
    await db.execute("DELETE FROM rate_limits");
    await db.execute("DELETE FROM email_outbox");
    for (let i = 0; i < 4; i++) await auth.requestPasswordResetAction({}, formOf({ email: EMAIL }));
    expect((await outbox()).length).toBe(3);
  });
});
