import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
// Bản giả của Supabase Storage: `objects` là file "đã tải lên" (12 byte đầu và kích thước).
const storage = vi.hoisted(() => ({ objects: new Map<string, { bytes: Uint8Array; size: number }>(), deleted: [] as string[], signed: [] as string[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {} }));
vi.mock("@/server/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/storage")>()),
  publicUrl: (path: string) => `https://cdn.example/media/${path}`,
  createSignedUploadUrl: async (path: string) => {
    storage.signed.push(path);
    return `https://storage.example/upload/sign/media/${path}?token=t`;
  },
  readObjectHead: async (path: string) => storage.objects.get(path) ?? null,
  deleteObject: async (path: string) => {
    storage.deleted.push(path);
  },
}));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const admin = await import("@/app/actions/admin");
const products = await import("@/server/repo/products");

// Phần đầu glTF nhị phân: "glTF", phiên bản, tổng độ dài (little-endian).
function header(version: number, length: number, magic = "glTF") {
  const bytes = new Uint8Array(12);
  bytes.set(new TextEncoder().encode(magic), 0);
  new DataView(bytes.buffer).setUint32(4, version, true);
  new DataView(bytes.buffer).setUint32(8, length, true);
  return bytes;
}

let productId: string;
async function upload(bytes: Uint8Array, size: number) {
  const start = await admin.startModelUploadAction(productId);
  if (!start.ok) throw new Error(start.message);
  storage.objects.set(start.path, { bytes, size });
  return { path: start.path, result: await admin.finishModelUploadAction(productId, start.path) };
}

beforeAll(async () => {
  await getDb();
  productId = (await products.findProductBySlug("acguy"))!.id;
});
afterAll(cleanup);

describe("tải mô hình 3D (T22)", () => {
  it("chỉ người có catalog.edit xin được URL tải lên; tên file do máy chủ đặt", async () => {
    await signInAs((await createUser("warehouse")).id);
    expect(await admin.startModelUploadAction(productId)).toMatchObject({ ok: false });
    await signInAs((await createUser("product_manager")).id);
    const start = await admin.startModelUploadAction(productId);
    expect(start).toMatchObject({ ok: true, uploadUrl: expect.stringContaining("token=") });
    expect(storage.signed.at(-1)).toMatch(new RegExp(`^models/${productId}-[a-f0-9]{12}\\.glb$`));
  });

  it("file sai chữ ký, sai phiên bản, sai độ dài hoặc quá 25 MB thì bị xoá và không gắn vào sản phẩm", async () => {
    const before = (await products.findProductById(productId))!.modelUrl;
    for (const [bytes, size] of [
      [header(2, 1000, "PK\u0003\u0004"), 1000],
      [header(1, 1000), 1000],
      [header(2, 999), 1000],
      [header(2, 26 * 1024 * 1024), 26 * 1024 * 1024],
    ] as const) {
      const { path, result } = await upload(bytes, size);
      expect(result.ok).toBeUndefined();
      expect(storage.deleted.at(-1)).toBe(path);
    }
    expect((await products.findProductById(productId))!.modelUrl).toBe(before);
  });

  it("đường dẫn không do máy chủ cấp cho sản phẩm này thì từ chối", async () => {
    expect(await admin.finishModelUploadAction(productId, "models/../../products/x.glb")).toEqual({ message: "Yêu cầu không hợp lệ." });
    expect(await admin.finishModelUploadAction(productId, `models/${"0".repeat(20)}-aaaaaaaaaaaa.glb`)).toEqual({ message: "Yêu cầu không hợp lệ." });
  });

  it("file .glb hợp lệ: cập nhật model_url và thêm product_media loại model", async () => {
    const { path, result } = await upload(header(2, 4096), 4096);
    expect(result.ok).toBe(true);
    expect((await products.findProductById(productId))!.modelUrl).toBe(`https://cdn.example/media/${path}`);
    const db = await getDb();
    const media = await db.execute({ sql: "SELECT kind FROM product_media WHERE product_id = ? AND url LIKE ?", args: [productId, `%${path}`] });
    expect(media.rows).toEqual([{ kind: "model" }]);
  });
});
