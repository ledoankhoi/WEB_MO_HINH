import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
const storage = vi.hoisted(() => ({ uploaded: [] as string[], deleted: [] as string[] }));
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
// Không gọi Supabase Storage thật trong test.
vi.mock("@/server/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/storage")>()),
  uploadObject: async (path: string) => {
    storage.uploaded.push(path);
    return `https://cdn.example/media/${path}`;
  },
  deleteObject: async (path: string) => {
    storage.deleted.push(path);
  },
}));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const { uploadProductImage, MAX_IMAGE_BYTES } = await import("@/server/media-upload");
const admin = await import("@/app/actions/admin");
const products = await import("@/server/repo/products");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const entry = { actor: { id: null, role: "product_manager" }, action: "product_media.upload", entity: "product_media", summary: "Tải ảnh" };
let productId: string;

beforeAll(async () => {
  await getDb();
  await signInAs((await createUser("product_manager")).id);
  productId = (await products.findProductBySlug("acguy"))!.id;
  const db = await getDb();
  await db.execute({ sql: "UPDATE products SET image = NULL WHERE id = ?", args: [productId] });
});
afterAll(cleanup);

describe("tải ảnh sản phẩm (T07)", () => {
  it("SEC-05: từ chối file không phải ảnh dù đuôi .png, và ảnh quá 5 MB", async () => {
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "anh.png", { type: "image/png" });
    expect(await uploadProductImage(productId, fake, "", entry)).toEqual({ ok: false, message: expect.stringMatching(/không phải ảnh/) });
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "to.png", { type: "image/png" });
    expect(await uploadProductImage(productId, big, "", entry)).toEqual({ ok: false, message: expect.stringMatching(/5 MB/) });
    expect(storage.uploaded).toEqual([]);
  });

  it("ảnh hợp lệ: tên file do máy chủ đặt, lưu media, ảnh đầu tiên thành ảnh đại diện", async () => {
    const first = await uploadProductImage(productId, new File([PNG], "../../bay.exe", { type: "application/x-msdownload" }), " Mặt trước ", entry);
    expect(first.ok).toBe(true);
    expect(storage.uploaded[0]).toMatch(new RegExp(`^products/${productId}-[a-f0-9]{12}\\.png$`));
    const second = await uploadProductImage(productId, new File([PNG], "b.png"), "Mặt sau", entry);
    expect(second.ok).toBe(true);
    const media = await products.listMedia(productId);
    expect(media.map((m) => m.alt)).toEqual(["Mặt trước", "Mặt sau"]);
    expect((await products.findProductById(productId))!.image).toBe(media[0].url);
  });

  it("đổi thứ tự, alt, ảnh đại diện; xoá ảnh đại diện thì lấy ảnh kế tiếp và xoá file trên Storage", async () => {
    let media = await products.listMedia(productId);
    expect((await admin.mediaAction(productId, media[1].id, { move: -1 })).ok).toBe(true);
    media = await products.listMedia(productId);
    expect(media.map((m) => m.alt)).toEqual(["Mặt sau", "Mặt trước"]);
    expect((await admin.mediaAction(productId, media[0].id, { alt: "  Mặt sau, có đế  " })).ok).toBe(true);
    expect((await admin.mediaAction(productId, media[0].id, { cover: true })).ok).toBe(true);
    expect((await products.findProductById(productId))!.image).toBe(media[0].url);

    expect((await admin.mediaAction(productId, media[0].id, { remove: true })).ok).toBe(true);
    expect((await products.findProductById(productId))!.image).toBe(media[1].url);
    expect(storage.deleted).toEqual([media[0].url.replace("https://cdn.example/media/", "")]);
    expect((await products.listMedia(productId)).map((m) => m.alt)).toEqual(["Mặt trước"]);
    expect((await admin.mediaAction(productId, "a".repeat(20), { cover: true })).message).toMatch(/không còn/);
  });

  it("nhân viên không có catalog.edit không sửa ảnh được", async () => {
    await signInAs((await createUser("warehouse")).id);
    const media = await products.listMedia(productId);
    expect(await admin.mediaAction(productId, media[0].id, { remove: true })).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });
  });
});
