import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const otp = await import("@/server/repo/otp");
const orders = await import("@/server/repo/orders");
const products = await import("@/server/repo/products");
const oauth = await import("@/server/repo/oauth");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("mã OTP", () => {
  it("chỉ lưu băm; đúng mã thì qua, dùng một lần; gửi lại phải đợi", async () => {
    const issued = await otp.issueOtp("verify_email", "a@example.com", 1_000_000);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.code).toMatch(/^\d{6}$/);
    const db = await getDb();
    const stored = (await db.execute("SELECT code_hash FROM otp_codes")).rows.map((row) => String(row.code_hash));
    expect(stored.some((value) => value.includes(issued.code))).toBe(false);

    expect(await otp.issueOtp("verify_email", "a@example.com", 1_030_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
    const check = await otp.checkOtp("verify_email", "a@example.com", issued.code, 1_100_000);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(await otp.consumeOtp(check.id)).toBe(true);
    expect(await otp.consumeOtp(check.id)).toBe(false);
    expect(await otp.checkOtp("verify_email", "a@example.com", issued.code, 1_100_000)).toEqual({ ok: false, reason: "missing" });
  });

  it("sai quá 5 lần thì khoá; hết hạn thì báo; mã mới làm mã cũ hết dùng được; khác mục đích không dùng chung", async () => {
    const issued = await otp.issueOtp("cod_order", "b@example.com", 2_000_000);
    if (!issued.ok) throw new Error("không gửi được");
    const wrong = issued.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < otp.OTP_MAX_ATTEMPTS - 1; i++) expect((await otp.checkOtp("cod_order", "b@example.com", wrong, 2_000_100)).ok).toBe(false);
    expect(await otp.checkOtp("cod_order", "b@example.com", wrong, 2_000_100)).toEqual({ ok: false, reason: "locked" });
    expect(await otp.checkOtp("cod_order", "b@example.com", issued.code, 2_000_100)).toEqual({ ok: false, reason: "locked" });

    const second = await otp.issueOtp("cod_order", "b@example.com", 2_100_000);
    if (!second.ok) throw new Error("không gửi được");
    expect(await otp.checkOtp("verify_email", "b@example.com", second.code, 2_100_100)).toEqual({ ok: false, reason: "missing" });
    expect(await otp.checkOtp("cod_order", "b@example.com", second.code, 2_100_000 + otp.OTP_TTL_MS)).toEqual({ ok: false, reason: "expired" });
  });

  it("xác thực email tài khoản; tài khoản tạo từ Google coi như đã xác thực", async () => {
    const user = await createUser("customer");
    await otp.markEmailVerified(user.id);
    const db = await getDb();
    const row = (await db.execute({ sql: "SELECT email_verified_at FROM users WHERE id = ?", args: [user.id] })).rows[0];
    expect(row.email_verified_at).not.toBeNull();

    const created = await oauth.resolveOAuthUser({ provider: "google", subject: "g-otp", email: "google-otp@example.com", emailVerified: true, name: "G" }, "hash");
    expect(created.ok).toBe(true);
    const verified = (await db.execute({ sql: "SELECT email_verified_at FROM users WHERE email = ?", args: ["google-otp@example.com"] })).rows[0];
    expect(verified.email_verified_at).not.toBeNull();
  });
});

describe("đơn COD giá trị lớn", () => {
  it("vượt ngưỡng mà chưa xác nhận thì yêu cầu mã; đã xác nhận thì đặt được; dưới ngưỡng không cần", async () => {
    const product = (await products.findProductBySlug("bruticus"))!;
    const draft = (verified: boolean, from: number) => ({
      userId: null,
      paymentMethod: "cod" as const,
      customerName: "Khách",
      customerPhone: "0901234567",
      customerEmail: "khach@example.com",
      shippingAddress: "1 Lê Lợi",
      shippingCity: "Huế",
      note: "",
      idempotencyKey: null,
      codOtp: { from, verified },
      items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
    });
    expect(await orders.createOrder(draft(false, product.price))).toMatchObject({ ok: false, reason: "otp_required" });
    expect((await orders.createOrder(draft(true, product.price))).ok).toBe(true);
    expect((await orders.createOrder(draft(false, product.price * 10))).ok).toBe(true);
  });
});
