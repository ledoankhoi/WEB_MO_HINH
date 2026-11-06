import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const { PRODUCT_PHOTOS } = await import("@/data/product-photos");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("ảnh thật của dữ liệu mẫu (src/data/product-photos.ts)", () => {
  // Một số mục là sản phẩm chỉ có trên CSDL thật (thêm qua trang quản trị), không có trong dữ liệu mẫu; khi khởi tạo,
  // slug không tồn tại thì bỏ qua. Ảnh phải nằm trên chính tên miền nguồn để trang sản phẩm ghi nguồn đúng.
  it("mỗi mục có ảnh https trên đúng tên miền nguồn; mục trùng sản phẩm mẫu thì trỏ tới sản phẩm có thật", async () => {
    const { SEED_PRODUCTS } = await import("@/server/db/seed-data");
    const seeded = new Set(SEED_PRODUCTS.map((product) => product.slug));
    for (const [slug, set] of Object.entries(PRODUCT_PHOTOS)) {
      if (seeded.has(slug)) expect(await products.findProductBySlug(slug), slug).not.toBeNull();
      expect(set.urls.length, slug).toBeGreaterThan(0);
      expect(new URL(set.sourceUrl).hostname.replace(/^www\./, ""), slug).toBe(set.source);
      for (const url of set.urls) {
        expect(new URL(url).protocol, url).toBe("https:");
        expect(new URL(url).hostname.replace(/^www\./, ""), url).toBe(set.source);
      }
    }
  });

  it("ảnh được ghi vào thư viện theo đúng thứ tự, ảnh đại diện vẫn là ảnh dựng 3D, có danh sách trong hộp", async () => {
    const product = (await products.findProductBySlug("zeta-gundam"))!;
    expect(product.images.map((image) => image.url)).toEqual(PRODUCT_PHOTOS["zeta-gundam"].urls);
    expect(product.image).toMatch(/\/products\/zeta-gundam\.webp$/);
    expect(product.boxContents.split("\n")).toEqual(PRODUCT_PHOTOS["zeta-gundam"].box);
  });

  it("sản phẩm chưa có ảnh thật giữ ảnh cũ và thư viện trống", async () => {
    const product = (await products.findProductBySlug("wild-force-megazord"))!;
    expect(product.images).toEqual([]);
    expect(product.image).toMatch(/\/products\/wild-force-megazord\.webp$/);
  });

  it("CSDL cũ có ảnh thật làm ảnh đại diện thì được trả về ảnh 3D; ảnh quản trị tự đổi thì giữ", async () => {
    const db = await getDb();
    const { restoreModelCardImages } = await import("@/server/db");
    await db.execute({ sql: "UPDATE products SET image = ? WHERE slug = 'sazabi'", args: [PRODUCT_PHOTOS["sazabi"].urls[0]] });
    await db.execute({ sql: "UPDATE products SET image = 'https://example.com/tu-doi.jpg' WHERE slug = 'acguy'", args: [] });
    await restoreModelCardImages((statement) => db.execute(statement));
    expect((await products.findProductBySlug("sazabi"))!.image).toMatch(/\/products\/sazabi\.webp$/);
    expect((await products.findProductBySlug("acguy"))!.image).toBe("https://example.com/tu-doi.jpg");
  });

  it("chạy lại khởi tạo không nhân đôi ảnh", async () => {
    const db = await getDb();
    const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM product_media WHERE kind = 'image'", args: [] });
    const { SEED_PRODUCTS } = await import("@/server/db/seed-data");
    const seeded = new Set(SEED_PRODUCTS.map((product) => product.slug));
    const expected = Object.entries(PRODUCT_PHOTOS)
      .filter(([slug]) => seeded.has(slug))
      .reduce((sum, [, set]) => sum + set.urls.length, 0);
    expect(Number(count.rows[0].n)).toBe(expected);
  });
});
