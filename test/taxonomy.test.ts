import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/permissions";
import { setupTempDatabase } from "./helpers/temp-db";

// Giả lập phần của Next.js mà Server Action dùng, như test/staff.test.ts.
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
const taxonomy = await import("@/server/repo/taxonomy");
const audit = await import("@/server/repo/audit");

afterAll(cleanup);
beforeEach(() => jar.clear());

async function signIn(role: Role) {
  const db = await getDb();
  const id = newId();
  const token = newToken();
  await db.batch([
    {
      sql: "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, 'x', ?, ?)",
      args: [id, `${role}-${id}@example.com`, role, role, Date.now()],
    },
    {
      sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      args: [sha256(token), id, Date.now() + 60_000, Date.now()],
    },
  ]);
  jar.set("rs_admin", token);
  return id;
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const find = async (kind: "categories" | "brands" | "series", slug: string) =>
  (await taxonomy.listTaxonomy(kind)).find((item) => item.slug === slug);
const entry = (action: string) => ({ actor: { id: null, role: "admin" }, action, entity: "categories", summary: "" });
const FORBIDDEN = "Bạn không có quyền thực hiện thao tác này.";

describe("danh mục, thương hiệu, series", () => {
  it("nạp danh mục từ CATEGORIES, thương hiệu và series từ dữ liệu mẫu", async () => {
    const categories = await taxonomy.listTaxonomy("categories");
    expect(categories.map((item) => item.slug).slice(0, 2)).toEqual(["transformers", "super-sentai"]);
    expect(categories.find((item) => item.slug === "transformers")?.productCount).toBeGreaterThan(0);
    expect((await taxonomy.listTaxonomy("brands")).map((item) => item.name)).toEqual(["Bandai", "Bandai Spirits", "Hasbro", "Takara Tomy"]);
    expect(await find("series", "mobile-suit-gundam-1979")).toBeDefined();
  });

  it("SEC-01: vai trò thiếu catalog.edit không tạo, xoá được", async () => {
    await signIn("viewer");
    expect(await admin.saveTaxonomyAction("brands", {}, form({ name: "Good Smile" }))).toEqual({ message: FORBIDDEN });
    const hasbro = await find("brands", "hasbro");
    expect((await admin.deleteTaxonomyAction("brands", hasbro!.id)).message).toBe(FORBIDDEN);
    expect(await find("brands", "good-smile")).toBeUndefined();
    expect(await find("brands", "hasbro")).toBeDefined();
  });

  it("tạo, sửa có nhật ký; slug trùng và loại lạ bị từ chối", async () => {
    const actor = await signIn("product_manager");
    expect((await admin.saveTaxonomyAction("brands", {}, form({ name: "Good Smile" }))).ok).toBe(true);
    const created = await find("brands", "good-smile");
    expect(created).toBeDefined();
    expect((await admin.saveTaxonomyAction("brands", {}, form({ name: "Good smile" }))).errors?.slug).toBeDefined();
    expect((await admin.saveTaxonomyAction("series", {}, form({ name: "Good Smile" }))).ok).toBe(true);
    expect((await admin.saveTaxonomyAction("users" as never, {}, form({ name: "X1" }))).message).toBe("Yêu cầu không hợp lệ.");

    const renamed = await admin.saveTaxonomyAction("brands", {}, form({ id: created!.id, name: "Good Smile Company", slug: "gsc" }));
    expect(renamed.ok).toBe(true);
    expect(await find("brands", "gsc")).toMatchObject({ id: created!.id, name: "Good Smile Company" });

    const { items } = await audit.listAuditLogs({ entity: "brands", entityId: created!.id });
    expect(items.map((item) => item.action)).toEqual(["brands.update", "brands.create"]);
    expect(items[0].actorId).toBe(actor);
    expect(JSON.parse(items[0].detail).after).toEqual({ slug: "gsc", name: "Good Smile Company" });
  });

  it("danh mục tối đa 2 cấp", async () => {
    await signIn("admin");
    const root = await find("categories", "mecha-anime");
    const other = await find("categories", "figure");
    expect((await admin.saveTaxonomyAction("categories", {}, form({ name: "Gundam", parentId: root!.id, sortOrder: "2" }))).ok).toBe(true);
    const child = await find("categories", "gundam");
    expect(child).toMatchObject({ parentId: root!.id, sortOrder: 2 });
    // Con xếp ngay sau cha.
    const list = await taxonomy.listTaxonomy("categories");
    expect(list[list.findIndex((item) => item.id === root!.id) + 1].id).toBe(child!.id);

    // Cấp 3, tự làm cha của mình, danh mục đang có con chuyển thành con: đều bị từ chối.
    const asRoot = { id: root!.id, name: root!.name, slug: root!.slug };
    expect((await admin.saveTaxonomyAction("categories", {}, form({ name: "Gundam SEED", parentId: child!.id }))).errors?.parentId).toBeDefined();
    expect((await admin.saveTaxonomyAction("categories", {}, form({ ...asRoot, parentId: root!.id }))).errors?.parentId).toBeDefined();
    expect((await admin.saveTaxonomyAction("categories", {}, form({ ...asRoot, parentId: other!.id }))).errors?.parentId).toBeDefined();

    // Kể cả gọi thẳng lớp dữ liệu.
    const input = { slug: "cap-3", name: "Cấp 3", description: "", parentId: child!.id, sortOrder: 0 };
    expect(await taxonomy.saveTaxonomy("categories", null, input, entry("categories.create"))).toBeNull();
    const moveRoot = { ...input, slug: root!.slug, parentId: other!.id };
    expect(await taxonomy.saveTaxonomy("categories", root!.id, moveRoot, entry("categories.update"))).toBeNull();
    expect(await find("categories", "cap-3")).toBeUndefined();
    expect((await find("categories", "mecha-anime"))?.parentId).toBeNull();
  });

  it("không xoá được khi còn sản phẩm hoặc danh mục con; không đổi slug danh mục còn sản phẩm", async () => {
    await signIn("product_manager");
    const used = await find("categories", "transformers");
    expect((await admin.deleteTaxonomyAction("categories", used!.id)).message).toMatch(/còn sản phẩm/);
    const renamed = await admin.saveTaxonomyAction("categories", {}, form({ id: used!.id, name: "Transformers", slug: "tf" }));
    expect(renamed.errors?.slug).toBeDefined();
    expect(await taxonomy.deleteTaxonomy("categories", used!.id, entry("categories.delete"))).toBe(false);
    const input = { slug: "tf", name: "Transformers", description: "", parentId: null, sortOrder: 0 };
    expect(await taxonomy.saveTaxonomy("categories", used!.id, input, entry("categories.update"))).toBeNull();
    expect(await find("categories", "transformers")).toBeDefined();

    await admin.saveTaxonomyAction("categories", {}, form({ name: "Gốc trống" }));
    const parent = await find("categories", "goc-trong");
    await admin.saveTaxonomyAction("categories", {}, form({ name: "Con trống", parentId: parent!.id }));
    const child = await find("categories", "con-trong");
    expect((await admin.deleteTaxonomyAction("categories", parent!.id)).message).toMatch(/danh mục con/);

    await expect(admin.deleteTaxonomyAction("categories", child!.id)).rejects.toThrow("REDIRECT /admin/danh-muc");
    await expect(admin.deleteTaxonomyAction("categories", parent!.id)).rejects.toThrow("REDIRECT /admin/danh-muc");
    expect(await find("categories", "goc-trong")).toBeUndefined();
    expect((await audit.listAuditLogs({ action: "categories.delete", entityId: parent!.id })).items).toHaveLength(1);

    // Thương hiệu đã gắn với sản phẩm (khoá ngoại từ T04) thì không xoá được.
    const brand = await find("brands", "takara-tomy");
    expect((await admin.deleteTaxonomyAction("brands", brand!.id)).message).toMatch(/còn sản phẩm/);
  });
});
