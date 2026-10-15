import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/permissions";
import { setupTempDatabase } from "./helpers/temp-db";

// Giả lập phần của Next.js mà Server Action dùng, như test/permissions.test.ts.
const jar = new Map<string, string>();
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
const { newId, newToken, sha256 } = await import("@/server/ids");
const admin = await import("@/app/actions/admin");
const staffRepo = await import("@/server/repo/staff");
const audit = await import("@/server/repo/audit");

afterAll(cleanup);
beforeEach(() => jar.clear());

async function createUser(role: Role) {
  const db = await getDb();
  const id = newId();
  const email = `${role}-${id}@example.com`;
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'x', ?, ?)",
    args: [id, email, role, role, Date.now()],
  });
  return { id, email };
}

// Thêm một phiên quản trị; `use` thì đặt luôn cookie để các action sau chạy dưới tên người này.
async function addSession(userId: string, use = false) {
  const db = await getDb();
  const token = newToken();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sha256(token), userId, Date.now() + 60_000, Date.now()],
  });
  if (use) jar.set("rs_admin", token);
}

async function sessionCount(userId: string) {
  const db = await getDb();
  return Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?", args: [userId] })).rows[0].n);
}

const userRow = async (id: string) => (await (await getDb()).execute({ sql: "SELECT role, is_active FROM users WHERE id = ?", args: [id] })).rows[0];

const createForm = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};

describe("quản lý nhân viên", () => {
  it("chỉ admin tạo được tài khoản; kiểm tra đầu vào, email trùng, có nhật ký", async () => {
    const accountant = await createUser("accountant");
    await addSession(accountant.id, true);
    const valid = { name: "Kho Một", email: "kho1@example.com", role: "warehouse", password: "mat-khau-tam-1" };
    expect(await admin.createStaffAction({}, createForm(valid))).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });

    const boss = await createUser("admin");
    await addSession(boss.id, true);
    const invalid = await admin.createStaffAction({}, createForm({ name: "A", email: "sai", role: "customer", password: "ngan" }));
    expect(Object.keys(invalid.errors ?? {}).toSorted()).toEqual(["email", "name", "password", "role"]);

    expect((await admin.createStaffAction({}, createForm(valid))).ok).toBe(true);
    const created = (await staffRepo.listStaff()).find((member) => member.email === "kho1@example.com")!;
    expect(created).toMatchObject({ role: "warehouse", isActive: true });
    expect((await admin.createStaffAction({}, createForm({ ...valid, email: "KHO1@example.com" }))).errors?.email).toBeDefined();

    const { items } = await audit.listAuditLogs({ action: "staff.create" });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ actorId: boss.id, entityId: created.id });
  });

  it("SEC-06: admin không tự hạ quyền hay tự khoá mình", async () => {
    const boss = await createUser("admin");
    await addSession(boss.id, true);
    expect((await admin.updateStaffAction(boss.id, { role: "viewer" })).ok).toBeUndefined();
    expect((await admin.updateStaffAction(boss.id, { isActive: false })).ok).toBeUndefined();
    expect(await userRow(boss.id)).toMatchObject({ role: "admin", is_active: true });
    // Kể cả gọi thẳng lớp dữ liệu.
    const entry = { actor: { id: boss.id, role: "admin" }, action: "staff.lock", entity: "users", summary: "" };
    expect(await staffRepo.updateStaff(boss.id, boss.id, { isActive: false }, entry)).toBe(false);
    expect(await sessionCount(boss.id)).toBe(1);
  });

  it("SEC-06: không khoá hay hạ quyền admin đang hoạt động cuối cùng, kể cả hai admin hạ quyền nhau cùng lúc", async () => {
    const db = await getDb();
    await db.execute("UPDATE users SET is_active = false WHERE role = 'admin'");
    const a = await createUser("admin");
    const b = await createUser("admin");
    const entry = (actorId: string) => ({ actor: { id: actorId, role: "admin" }, action: "staff.role_change", entity: "users", summary: "" });

    const results = await Promise.all([
      staffRepo.updateStaff(a.id, b.id, { role: "viewer" }, entry(a.id)),
      staffRepo.updateStaff(b.id, a.id, { role: "viewer" }, entry(b.id)),
    ]);
    expect(results.toSorted()).toEqual([false, true]);
    const remaining = await db.execute("SELECT id FROM users WHERE role = 'admin' AND is_active");
    expect(remaining.rows).toHaveLength(1);

    // Người còn lại là admin cuối cùng: người khác (ví dụ qua lớp dữ liệu) cũng không khoá được.
    const last = String(remaining.rows[0].id);
    const other = last === a.id ? b.id : a.id;
    expect(await staffRepo.updateStaff(other, last, { isActive: false }, { ...entry(other), action: "staff.lock" })).toBe(false);
    expect(await userRow(last)).toMatchObject({ role: "admin", is_active: true });
  });

  it("đổi vai trò và khoá xoá mọi phiên của người đó, mỗi thao tác một dòng nhật ký có trước và sau", async () => {
    const boss = await createUser("admin");
    const staff = await createUser("warehouse");
    await addSession(staff.id);
    await addSession(staff.id);
    await addSession(boss.id, true);

    expect((await admin.updateStaffAction(staff.id, { role: "warehouse_manager" })).ok).toBe(true);
    expect(await userRow(staff.id)).toMatchObject({ role: "warehouse_manager" });
    expect(await sessionCount(staff.id)).toBe(0);
    const [roleLog] = (await audit.listAuditLogs({ action: "staff.role_change", entityId: staff.id })).items;
    expect(JSON.parse(roleLog.detail)).toEqual({ before: { role: "warehouse" }, after: { role: "warehouse_manager" } });

    await addSession(staff.id);
    expect((await admin.updateStaffAction(staff.id, { isActive: false })).ok).toBe(true);
    expect(await sessionCount(staff.id)).toBe(0);
    expect((await admin.updateStaffAction(staff.id, { isActive: true })).ok).toBe(true);
    expect(await userRow(staff.id)).toMatchObject({ is_active: true });
    expect((await audit.listAuditLogs({ entityId: staff.id, entity: "users" })).total).toBe(3);

    // Dữ liệu lạ hoặc tài khoản khách bị từ chối.
    const customer = await createUser("customer");
    expect((await admin.updateStaffAction(customer.id, { isActive: false })).ok).toBeUndefined();
    expect((await admin.updateStaffAction(staff.id, { role: "customer" })).ok).toBeUndefined();
    expect((await admin.updateStaffAction("khong-phai-id", { isActive: false })).ok).toBeUndefined();
    expect(await userRow(customer.id)).toMatchObject({ is_active: true });
  });
});

describe("trang nhật ký", () => {
  it("lọc theo người, hành động, đối tượng, khoảng thời gian và phân trang", async () => {
    const actor = await createUser("accountant");
    const base = Date.UTC(2020, 0, 1);
    const db = await getDb();
    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: `INSERT INTO audit_logs (actor_id, actor_role, action, entity, entity_id, summary, created_at)
              VALUES (?, 'accountant', ?, 'orders', ?, 'thử', ?)`,
        args: [actor.id, i % 2 ? "test.odd" : "test.even", `don-${i}`, base + i * 1000],
      });
    }

    const mine = await audit.listAuditLogs({ actorId: actor.id, pageSize: 2 });
    expect(mine.total).toBe(5);
    expect(mine.items.map((log) => log.entityId)).toEqual(["don-4", "don-3"]);
    expect(mine.items[0]).toMatchObject({ actorName: "accountant", actorRole: "accountant" });
    expect((await audit.listAuditLogs({ actorId: actor.id, pageSize: 2, page: 3 })).items.map((log) => log.entityId)).toEqual(["don-0"]);
    expect((await audit.listAuditLogs({ action: "test.odd" })).total).toBe(2);
    expect((await audit.listAuditLogs({ entity: "orders", entityId: "don-2" })).total).toBe(1);
    expect((await audit.listAuditLogs({ actorId: actor.id, from: base + 1000, to: base + 3000 })).items.map((log) => log.entityId)).toEqual([
      "don-2",
      "don-1",
    ]);
    expect((await audit.listAuditFacets()).actions).toEqual(expect.arrayContaining(["test.even", "test.odd"]));
  });
});
