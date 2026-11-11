import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

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
const { formOf } = await import("./helpers/staff");
const { newId, newToken, sha256 } = await import("@/server/ids");
const { hashPassword } = await import("@/server/auth/password");
const users = await import("@/server/repo/users");
const addresses = await import("@/server/repo/addresses");
const account = await import("@/app/actions/account");
const { GET: exportData } = await import("@/app/api/tai-khoan/du-lieu/route");
const { DELETE_CONFIRM_PHRASE, MAX_ADDRESSES } = await import("@/lib/account");

const PASSWORD = "mat-khau-cua-khach";
const home = { label: "home" as const, recipientName: "Trần Lan", phone: "0912345678", address: "12 Lê Lợi, Bến Thành", city: "TP. Hồ Chí Minh" };

// Đăng nhập cửa hàng: đặt thẳng cookie rs_session như máy chủ làm sau khi xác minh mật khẩu. Trả về id phiên.
async function signInCustomer(userId: string): Promise<string> {
  const db = await getDb();
  const token = newToken();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sha256(token), userId, Date.now() + 3_600_000, Date.now()],
  });
  jar.set("rs_session", token);
  return sha256(token);
}

async function newCustomer(email: string) {
  return users.insertUser({ email, name: "Trần Lan", phone: "0912345678", passwordHash: await hashPassword(PASSWORD), marketingConsent: true });
}

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("sổ địa chỉ (YC-TKH-03)", () => {
  it("địa chỉ đầu tiên tự thành mặc định và được chép vào hồ sơ; đặt địa chỉ khác làm mặc định thì chỉ còn một mặc định", async () => {
    const userId = await newCustomer("so-dia-chi@example.com");
    expect(await addresses.saveAddress(userId, null, home, false)).toBe("ok");
    let list = await addresses.listAddresses(userId);
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);

    await addresses.saveAddress(userId, null, { ...home, label: "office", address: "5 Nguyễn Huệ, Bến Nghé" }, true);
    list = await addresses.listAddresses(userId);
    expect(list.filter((item) => item.isDefault).map((item) => item.address)).toEqual(["5 Nguyễn Huệ, Bến Nghé"]);
    const db = await getDb();
    const profile = await db.execute({ sql: "SELECT address, city FROM users WHERE id = ?", args: [userId] });
    expect(profile.rows[0]).toMatchObject({ address: "5 Nguyễn Huệ, Bến Nghé", city: "TP. Hồ Chí Minh" });

    // Xoá địa chỉ mặc định: địa chỉ còn lại thành mặc định.
    const office = list.find((item) => item.isDefault)!;
    expect(await addresses.deleteAddress(userId, office.id)).toBe(true);
    list = await addresses.listAddresses(userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ address: home.address, isDefault: true });

    // Xoá hết thì hồ sơ không còn địa chỉ.
    await addresses.deleteAddress(userId, list[0].id);
    const empty = await db.execute({ sql: "SELECT address, city FROM users WHERE id = ?", args: [userId] });
    expect(empty.rows[0]).toMatchObject({ address: "", city: "" });
  });

  it("không sửa, xoá, đặt mặc định được địa chỉ của tài khoản khác; tối đa MAX_ADDRESSES địa chỉ", async () => {
    const owner = await newCustomer("chu-dia-chi@example.com");
    const other = await newCustomer("nguoi-khac@example.com");
    await addresses.saveAddress(owner, null, home, false);
    const [mine] = await addresses.listAddresses(owner);
    expect(await addresses.saveAddress(other, mine.id, { ...home, address: "bị sửa trộm" }, false)).toBe("not_found");
    expect(await addresses.deleteAddress(other, mine.id)).toBe(false);
    expect(await addresses.setDefaultAddress(other, mine.id)).toBe(false);
    expect((await addresses.listAddresses(owner))[0].address).toBe(home.address);

    for (let i = 1; i < MAX_ADDRESSES; i++) await addresses.saveAddress(owner, null, { ...home, address: `${i} Đường số ${i}` }, false);
    expect(await addresses.saveAddress(owner, null, home, false)).toBe("limit");
  });

  it("action kiểm tra dữ liệu: số điện thoại, tỉnh thành, loại địa chỉ", async () => {
    const userId = await newCustomer("action-dia-chi@example.com");
    await signInCustomer(userId);
    const bad = await account.saveAddressAction({}, formOf({ label: "kho", recipientName: "A", phone: "123", address: "x", city: "Sao Hỏa" }));
    expect(Object.keys(bad.errors ?? {}).sort()).toEqual(["address", "city", "label", "phone", "recipientName"]);
    const ok = await account.saveAddressAction({}, formOf({ ...home, phone: "0912 345 678" }));
    expect(ok.ok).toBe(true);
    expect((await addresses.listAddresses(userId))[0].phone).toBe("0912345678");
  });
});

describe("tài khoản & bảo mật, thông báo", () => {
  it("đăng xuất mọi thiết bị khác giữ phiên đang dùng", async () => {
    const userId = await newCustomer("thiet-bi@example.com");
    await signInCustomer(userId);
    await signInCustomer(userId);
    const current = await signInCustomer(userId);
    expect(await users.countActiveSessions(userId)).toBe(3);
    expect((await account.logoutOtherDevicesAction()).message).toContain("2 thiết bị");
    expect(await users.countActiveSessions(userId)).toBe(1);
    expect((await users.findSessionUser(current))?.id).toBe(userId);
  });

  it("tắt nhận tin khuyến mãi", async () => {
    const userId = await newCustomer("thong-bao@example.com");
    await signInCustomer(userId);
    await account.updateNotificationsAction({}, formOf({}));
    expect((await users.listCustomers({ id: userId })).items[0]).toMatchObject({ marketingConsent: false, marketingConsentAt: null });
  });
});

describe("quyền riêng tư", () => {
  async function insertOrder(userId: string, status: string) {
    const db = await getDb();
    const id = newId();
    await db.execute({
      sql: `INSERT INTO orders (id, code, token, user_id, status, payment_method, customer_name, customer_phone, shipping_address, shipping_city,
              subtotal, shipping_fee, total, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'cod', 'Trần Lan', '0912345678', '12 Lê Lợi', 'TP. Hồ Chí Minh', 100000, 0, 100000, ?, ?)`,
      args: [id, `RB-${id.slice(0, 8)}`, newToken(), userId, status, Date.now(), Date.now()],
    });
    return id;
  }

  it("tải dữ liệu cá nhân: chỉ của tài khoản đang đăng nhập, không có mật khẩu; chưa đăng nhập thì 401", async () => {
    jar.delete("rs_session");
    expect((await exportData()).status).toBe(401);

    const userId = await newCustomer("tai-du-lieu@example.com");
    await addresses.saveAddress(userId, null, home, false);
    await insertOrder(userId, "completed");
    await signInCustomer(userId);
    const response = await exportData();
    expect(response.headers.get("content-disposition")).toContain("attachment");
    const text = await response.text();
    const data = JSON.parse(text);
    expect(data.profile.email).toBe("tai-du-lieu@example.com");
    expect(data.addresses).toHaveLength(1);
    expect(data.orders).toHaveLength(1);
    expect(text).not.toMatch(/password|scrypt|session/i);
  });

  it("xoá tài khoản: sai mật khẩu, sai câu xác nhận, còn đơn đang xử lý thì từ chối", async () => {
    const userId = await newCustomer("chua-xoa-duoc@example.com");
    await signInCustomer(userId);
    expect((await account.deleteAccountAction({}, formOf({ password: "sai", confirm: DELETE_CONFIRM_PHRASE }))).errors?.password).toBeTruthy();
    expect((await account.deleteAccountAction({}, formOf({ password: PASSWORD, confirm: "xoa" }))).errors?.confirm).toBeTruthy();
    await insertOrder(userId, "processing");
    const blocked = await account.deleteAccountAction({}, formOf({ password: PASSWORD, confirm: DELETE_CONFIRM_PHRASE }));
    expect(blocked.ok).toBeFalsy();
    expect(blocked.message).toContain("1 đơn hàng đang xử lý");
    expect((await users.listCustomers({ id: userId })).items[0].isActive).toBe(true);
  });

  it("xoá tài khoản thành công: ẩn danh, khoá đăng nhập, xoá phiên và sổ địa chỉ, giữ đơn cũ, email đăng ký lại được, có nhật ký", async () => {
    const userId = await newCustomer("se-xoa@example.com");
    await addresses.saveAddress(userId, null, home, false);
    const orderId = await insertOrder(userId, "completed");
    const session = await signInCustomer(userId);

    const result = await account.deleteAccountAction({}, formOf({ password: PASSWORD, confirm: DELETE_CONFIRM_PHRASE }));
    expect(result.ok).toBe(true);
    expect(jar.has("rs_session")).toBe(false);

    const db = await getDb();
    const row = (await db.execute({ sql: "SELECT email, name, phone, address, is_active, deleted_at FROM users WHERE id = ?", args: [userId] })).rows[0];
    expect(row).toMatchObject({ name: "Tài khoản đã xoá", phone: "", address: "", is_active: false });
    expect(String(row.email)).not.toContain("se-xoa");
    expect(row.deleted_at).not.toBeNull();
    expect(await users.findSessionUser(session)).toBeNull();
    expect(await users.findCredentialsByEmail("se-xoa@example.com")).toBeNull();
    expect(await addresses.listAddresses(userId)).toEqual([]);
    expect((await db.execute({ sql: "SELECT 1 FROM orders WHERE id = ?", args: [orderId] })).rows).toHaveLength(1);
    const log = await db.execute({ sql: "SELECT action FROM audit_logs WHERE entity_id = ? AND action = 'customer.self_delete'", args: [userId] });
    expect(log.rows).toHaveLength(1);

    // Email cũ đăng ký lại được.
    await expect(newCustomer("se-xoa@example.com")).resolves.toEqual(expect.any(String));
  });
});
