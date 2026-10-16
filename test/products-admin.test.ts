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
const admin = await import("@/app/actions/admin");
const products = await import("@/server/repo/products");

beforeAll(async () => {
  await getDb();
  await signInAs((await createUser("product_manager")).id);
});
afterAll(cleanup);

const productForm = (values: Record<string, string>) =>
  formOf({
    name: "Robot quản trị",
    slug: "robot-quan-tri",
    category: "figure",
    productType: "figure",
    sku: "RB-QT-01",
    price: "450000",
    model: "humanoid",
    colorPrimary: "#111111",
    colorSecondary: "#222222",
    colorAccent: "#333333",
    specs: "",
    status: "draft",
    ...values,
  });

async function createDraft(): Promise<string> {
  const error = await admin.saveProductAction({}, productForm({})).catch((e: Error) => e);
  return /san-pham\/([a-f0-9]{20})/.exec(String(error))![1];
}

describe("quản trị sản phẩm có biến thể (T06)", () => {
  it("YC-SP-05: chưa có ảnh thì không xuất bản được; danh mục, thương hiệu phải có trong CSDL", async () => {
    const id = await createDraft();
    const result = await admin.saveProductAction({}, productForm({ id, status: "published" }));
    expect(result.errors?.status).toMatch(/ảnh đại diện/);
    expect((await admin.saveProductAction({}, productForm({ id, category: "khong-co", brandId: "a".repeat(20) }))).errors).toMatchObject({
      category: expect.any(String),
      brandId: expect.any(String),
    });
    const db = await getDb();
    await db.execute({ sql: "UPDATE products SET image = '/media/x' WHERE id = ?", args: [id] });
    expect((await admin.saveProductAction({}, productForm({ id, status: "published", scale: "1/144", grade: "HG" }))).ok).toBe(true);
    expect(await products.findProductById(id)).toMatchObject({ status: "published", scale: "1/144", grade: "HG", productType: "figure" });
  });

  it("YC-SP-03: thêm biến thể, SKU khoá khi đã có sổ kho; mã vạch duy nhất; tắt và đặt mặc định đúng luật", async () => {
    const id = (await products.findProductBySlug("robot-quan-tri"))!.id;
    expect((await admin.saveVariantAction(id, {}, formOf({ sku: "rb-qt-gold", name: "Bản mạ vàng", price: "990000", barcode: "8934567890123", colorPrimary: "#d4af37", colorSecondary: "#222222", colorAccent: "#333333" }))).ok).toBe(true);
    let product = (await products.findProductById(id))!;
    const gold = product.variants.find((v) => v.sku === "RB-QT-GOLD")!;
    expect(gold).toMatchObject({ isDefault: false, isActive: true, locked: false, barcode: "8934567890123" });

    expect((await admin.saveVariantAction(id, {}, formOf({ sku: "RB-QT-02", name: "Trùng mã vạch", price: "1", barcode: "8934567890123", colorPrimary: "#000000", colorSecondary: "#000000", colorAccent: "#000000" }))).errors?.sku).toMatch(/đã được dùng/);

    // Ghi một dòng sổ kho cho biến thể vàng: từ đó SKU không đổi được.
    const db = await getDb();
    const { movementStatements } = await import("@/server/repo/inventory");
    const a01 = String((await db.execute("SELECT id FROM locations WHERE code = 'A-01'")).rows[0].id);
    await db.batch(movementStatements({ variantId: gold.id, locationId: a01, type: "adjust_in", qtyDelta: 1, now: Date.now() }));
    const locked = await admin.saveVariantAction(id, {}, formOf({ id: gold.id, sku: "RB-QT-NEW", name: "Bản mạ vàng", price: "990000", colorPrimary: "#d4af37", colorSecondary: "#222222", colorAccent: "#333333" }));
    expect(locked.errors?.sku).toMatch(/không đổi SKU/);

    const defaultId = product.variants.find((v) => v.isDefault)!.id;
    expect((await admin.variantAction(id, defaultId, "deactivate")).message).toMatch(/mặc định/);
    expect((await admin.variantAction(id, gold.id, "default")).ok).toBe(true);
    expect((await admin.variantAction(id, defaultId, "deactivate")).ok).toBe(true);
    product = (await products.findProductById(id))!;
    expect(product.variantId).toBe(gold.id);
    expect(product.price).toBe(990000);
  });

  it("YC-SP-07: đổi giá biến thể ghi nhật ký giá trước, sau và hiện trong lịch sử giá", async () => {
    const product = (await products.findProductBySlug("robot-quan-tri"))!;
    const gold = product.variants.find((v) => v.sku === "RB-QT-GOLD")!;
    expect((await admin.saveVariantAction(product.id, {}, formOf({ id: gold.id, sku: "RB-QT-GOLD", name: "Bản mạ vàng", price: "1090000", colorPrimary: "#d4af37", colorSecondary: "#222222", colorAccent: "#333333" }))).ok).toBe(true);
    const history = await products.listPriceHistory(product.id);
    expect(history[0]).toMatchObject({ before: { price: 990000 }, after: { price: 1090000 } });
  });
});
