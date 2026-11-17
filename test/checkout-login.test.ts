import { afterAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// YC-GH-03 (chủ dự án chốt 17/11/2026): phải đăng nhập mới đặt được hàng, kể cả khi gọi thẳng Server Action.
const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (options: string | { name: string }) => jar.delete(typeof options === "string" ? options : options.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { newToken, sha256 } = await import("@/server/ids");
const { hashPassword } = await import("@/server/auth/password");
const users = await import("@/server/repo/users");
const products = await import("@/server/repo/products");
const { placeOrderAction } = await import("@/app/actions/orders");
const { requireUser } = await import("@/server/auth/session");

afterAll(cleanup);

async function orderForm() {
  const product = (await products.findProductBySlug("bruticus"))!;
  const form = new FormData();
  for (const [key, value] of Object.entries({
    name: "Trần Lan",
    phone: "0912345678",
    email: "lan@example.com",
    address: "12 Lê Lợi, Bến Thành",
    city: "TP. Hồ Chí Minh",
    paymentMethod: "cod",
    items: JSON.stringify([{ id: product.variantId, qty: 1, price: product.price }]),
  })) {
    form.set(key, value);
  }
  return form;
}

const orderCount = async () => Number((await (await getDb()).execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n);

describe("phải đăng nhập mới đặt hàng (YC-GH-03)", () => {
  it("trang thanh toán chuyển khách chưa đăng nhập sang trang đăng nhập, kèm đường quay lại", async () => {
    jar.clear();
    await expect(requireUser("/thanh-toan")).rejects.toThrow("REDIRECT /dang-nhap?next=%2Fthanh-toan");
  });

  it("Server Action từ chối khi không có phiên, không tạo đơn", async () => {
    jar.clear();
    const before = await orderCount();
    const result = await placeOrderAction({}, await orderForm());
    expect(result.ok).toBeFalsy();
    expect(result.message).toMatch(/đăng nhập/);
    expect(await orderCount()).toBe(before);
  });

  it("khách đã đăng nhập đặt được hàng, đơn gắn với tài khoản", async () => {
    const userId = await users.insertUser({ email: "lan@example.com", name: "Trần Lan", phone: "0912345678", passwordHash: await hashPassword("mat-khau-cua-khach"), marketingConsent: false });
    // Email tài khoản đã xác thực trùng email của đơn: đơn COD giá trị lớn (Bruticus) không cần nhập mã OTP.
    await (await getDb()).execute({ sql: "UPDATE users SET email_verified_at = ? WHERE id = ?", args: [Date.now(), userId] });
    const token = newToken();
    await (await getDb()).execute({
      sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      args: [sha256(token), userId, Date.now() + 3_600_000, Date.now()],
    });
    jar.set("rs_session", token);

    const result = await placeOrderAction({}, await orderForm());
    expect(result).toMatchObject({ ok: true });
    const row = (await (await getDb()).execute({ sql: "SELECT user_id FROM orders WHERE token = ?", args: [result.token!] })).rows[0];
    expect(row.user_id).toBe(userId);
  });
});
