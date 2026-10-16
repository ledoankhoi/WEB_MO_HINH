import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === "string" ? cookie : cookie.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, formOf, signInAs } = await import("./helpers/staff");
const actions = await import("@/app/actions/inventory");
const warehouse = await import("@/server/repo/warehouse");

beforeAll(async () => {
  await getDb();
  await signInAs((await createUser("warehouse_manager")).id);
});
afterAll(cleanup);

const location = async (code: string) => (await warehouse.listLocations()).find((l) => l.code === code)!;

describe("vị trí kho (YC-KHO-01)", () => {
  it("có sẵn A-01 (đang chứa hàng mẫu) và CACH-LY; tạo vị trí mới, chặn trùng mã", async () => {
    expect((await location("A-01")).onHand).toBeGreaterThan(0);
    expect((await location("CACH-LY")).type).toBe("quarantine");

    expect(await actions.saveLocationAction({}, formOf({ code: "a-02-01", name: "Kệ A-02 tầng 1", type: "storage" }))).toMatchObject({ ok: true });
    expect(await location("A-02-01")).toMatchObject({ name: "Kệ A-02 tầng 1", isActive: true, onHand: 0 });
    expect((await actions.saveLocationAction({}, formOf({ code: "A-02-01", name: "", type: "storage" }))).errors?.code).toMatch(/đã có/);
    expect((await actions.saveLocationAction({}, formOf({ code: "A 02", name: "", type: "kho" }))).errors).toMatchObject({ code: expect.any(String), type: expect.any(String) });
  });

  it("vị trí còn hàng không ngừng dùng, không đổi loại được; vị trí trống thì được", async () => {
    const a01 = await location("A-01");
    expect((await actions.setLocationActiveAction(a01.id, false)).ok).toBeUndefined();
    const changeType = await actions.saveLocationAction({}, formOf({ id: a01.id, code: "A-01", name: a01.name, type: "quarantine" }));
    expect(changeType.errors?.type).toMatch(/có hàng/);
    expect((await location("A-01")).type).toBe("storage");

    const empty = await location("A-02-01");
    expect((await actions.setLocationActiveAction(empty.id, false)).ok).toBe(true);
    expect((await location("A-02-01")).isActive).toBe(false);
    expect((await actions.saveLocationAction({}, formOf({ id: empty.id, code: "A-02-01", name: "", type: "quarantine" }))).ok).toBe(true);
    expect((await actions.setLocationActiveAction(empty.id, true)).ok).toBe(true);
  });
});

describe("nhà cung cấp (YC-KHO-02)", () => {
  it("tạo, sửa, ngừng giao dịch; kiểm tra dữ liệu đầu vào", async () => {
    const created = await actions.saveSupplierAction({}, formOf({ code: "ncc-01", name: "Bandai Namco VN", phone: "0901 234 567", email: "LH@BANDAI.EXAMPLE" }));
    expect(created.ok).toBe(true);
    const supplier = (await warehouse.listSuppliers()).find((s) => s.code === "NCC-01")!;
    expect(supplier).toMatchObject({ name: "Bandai Namco VN", email: "lh@bandai.example", isActive: true });

    expect((await actions.saveSupplierAction({}, formOf({ code: "NCC-01", name: "Trùng mã" }))).errors?.code).toMatch(/đã được dùng/);
    expect((await actions.saveSupplierAction({}, formOf({ code: "NCC-02", name: "X", email: "sai" }))).errors).toMatchObject({ name: expect.any(String), email: expect.any(String) });

    expect((await actions.saveSupplierAction({}, formOf({ id: supplier.id, code: "NCC-01", name: "Bandai Namco Việt Nam" }))).ok).toBe(true);
    expect((await actions.setSupplierActiveAction(supplier.id, false)).ok).toBe(true);
    expect((await warehouse.listSuppliers()).find((s) => s.id === supplier.id)).toMatchObject({ name: "Bandai Namco Việt Nam", isActive: false });

    const db = await getDb();
    const logs = await db.execute({ sql: "SELECT action FROM audit_logs WHERE entity = 'suppliers' ORDER BY id", args: [] });
    expect(logs.rows.map((r) => r.action)).toEqual(["supplier.create", "supplier.update", "supplier.deactivate"]);
  });

  it("nhân viên kho không có quyền thiết lập kho", async () => {
    await signInAs((await createUser("warehouse")).id);
    expect(await actions.saveLocationAction({}, formOf({ code: "B-01", name: "", type: "storage" }))).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });
    expect(await actions.saveSupplierAction({}, formOf({ code: "NCC-09", name: "Không được" }))).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });
  });
});
