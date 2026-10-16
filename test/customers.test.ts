import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const users = await import("@/server/repo/users");
const admin = await import("@/app/actions/admin");
const { maskContact, requireCustomerAccess } = await import("@/server/customer-access");

let customerId: string;
beforeAll(async () => {
  await getDb();
  customerId = await users.insertUser({ email: "lan@example.com", name: "Trần Lan", phone: "0912345678", passwordHash: "x", marketingConsent: true });
  await users.insertUser({ email: "minh@example.com", name: "Lê Minh", phone: "", passwordHash: "x" });
});
afterAll(cleanup);

describe("khách hàng (T17)", () => {
  it("tìm theo tên, email, số điện thoại; đồng ý nhận tin lưu thời điểm, mặc định không đồng ý", async () => {
    expect((await users.listCustomers({ q: "lan" })).items.map((c) => c.email)).toEqual(["lan@example.com"]);
    expect((await users.listCustomers({ q: "0912" })).total).toBe(1);
    const [lan] = (await users.listCustomers({ id: customerId })).items;
    expect(lan).toMatchObject({ marketingConsent: true, isActive: true, marketingConsentAt: expect.any(Number) });
    expect((await users.listCustomers({ q: "minh" })).items[0]).toMatchObject({ marketingConsent: false, marketingConsentAt: null });

    await users.updateUserProfile(customerId, { name: "Trần Lan", phone: "0912345678", address: "", city: "", marketingConsent: false });
    expect((await users.listCustomers({ id: customerId })).items[0]).toMatchObject({ marketingConsent: false, marketingConsentAt: null });
  });

  it("SEC-02: vai trò viewer vào được nhưng email, số điện thoại, địa chỉ bị che ở máy chủ; vai trò khác không vào được", async () => {
    await signInAs((await createUser("viewer")).id);
    const access = await requireCustomerAccess("/admin/khach-hang");
    expect(access.masked).toBe(true);
    const [lan] = (await users.listCustomers({ id: customerId })).items;
    expect(maskContact({ ...lan, address: "12 Lê Lợi" }, true)).toMatchObject({ email: "l***@example.com", phone: "09******78", address: "***" });

    await signInAs((await createUser("support")).id);
    expect((await requireCustomerAccess("/admin/khach-hang")).masked).toBe(false);
    await signInAs((await createUser("marketing")).id);
    await expect(requireCustomerAccess("/admin/khach-hang")).rejects.toThrow("NOT_FOUND");
  });

  it("YC-KH-03: chăm sóc khách hàng khoá tài khoản thì mọi phiên bị xoá; vai trò khác không khoá được", async () => {
    await users.insertSession("phien-khach", customerId, Date.now() + 60_000);
    await signInAs((await createUser("order_staff")).id);
    expect(await admin.setCustomerActiveAction(customerId, false)).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });

    await signInAs((await createUser("support")).id);
    expect((await admin.setCustomerActiveAction(customerId, false)).ok).toBe(true);
    expect(await users.findSessionUser("phien-khach")).toBeNull();
    expect((await users.findCredentialsByEmail("lan@example.com"))?.isActive).toBe(false);
    expect((await admin.setCustomerActiveAction(customerId, false)).ok).toBeUndefined();
    expect((await admin.setCustomerActiveAction(customerId, true)).ok).toBe(true);
  });
});
