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
  it("mỗi mục trỏ tới một sản phẩm mẫu có thật, đường dẫn https", async () => {
    for (const [slug, set] of Object.entries(PRODUCT_PHOTOS)) {
      expect(await products.findProductBySlug(slug), slug).not.toBeNull();
      expect(set.urls.length, slug).toBeGreaterThan(0);
      for (const url of set.urls) expect(new URL(url).protocol, url).toBe("https:");
    }
  });

  it("ảnh được ghi vào thư viện theo đúng thứ tự, ảnh đầu tiên là ảnh đại diện, có danh sách trong hộp", async () => {
    const product = (await products.findProductBySlug("zeta-gundam"))!;
    expect(product.images.map((image) => image.url)).toEqual(PRODUCT_PHOTOS["zeta-gundam"].urls);
    expect(product.image).toBe(PRODUCT_PHOTOS["zeta-gundam"].urls[0]);
    expect(product.boxContents.split("\n")).toEqual(PRODUCT_PHOTOS["zeta-gundam"].box);
  });

  it("sản phẩm chưa có ảnh thật giữ ảnh cũ và thư viện trống", async () => {
    const product = (await products.findProductBySlug("muteki-shogun"))!;
    expect(product.images).toEqual([]);
    expect(product.image).toMatch(/\/products\/muteki-shogun\.webp$/);
  });

  it("chạy lại khởi tạo không nhân đôi ảnh", async () => {
    const db = await getDb();
    const count = await db.execute({ sql: "SELECT COUNT(*) AS n FROM product_media WHERE kind = 'image'", args: [] });
    const expected = Object.values(PRODUCT_PHOTOS).reduce((sum, set) => sum + set.urls.length, 0);
    expect(Number(count.rows[0].n)).toBe(expected);
  });
});
