import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const { findSlugRedirect, loadSlugRedirects } = await import("@/server/slug-redirects");

type Input = Parameters<typeof products.insertProduct>[0];
const input = (slug: string, sku: string): Input => ({
  slug,
  name: `Robot ${slug}`,
  tagline: "",
  description: "",
  category: "transformers",
  brandId: null,
  seriesId: null,
  productType: "figure",
  scale: "",
  grade: "",
  boxContents: "",
  sku,
  price: 100_000,
  compareAtPrice: null,
  model: "humanoid",
  modelUrl: null,
  colors: { primary: "#111111", secondary: "#222222", accent: "#333333" },
  specs: [],
  isFeatured: false,
  metaTitle: "Tiêu đề SEO",
  metaDescription: "Mô tả SEO",
  status: "published",
});

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("SEO và chuyển hướng slug (T21)", () => {
  it("lưu tiêu đề, mô tả meta", async () => {
    const id = await products.insertProduct(input("robot-seo", "SEO-1"));
    expect(await products.findProductById(id)).toMatchObject({ metaTitle: "Tiêu đề SEO", metaDescription: "Mô tả SEO" });
  });

  it("YC-SP-09: đổi slug nhiều lần, mọi slug cũ đều về slug hiện tại; slug được dùng lại thì bỏ chuyển hướng", async () => {
    const id = await products.insertProduct(input("robot-a", "SEO-A"));
    await products.updateProduct(id, input("robot-b", "SEO-A"));
    await products.updateProduct(id, input("robot-c", "SEO-A"));
    let map = await loadSlugRedirects();
    expect(map.get("robot-a")).toBe("robot-c");
    expect(map.get("robot-b")).toBe("robot-c");
    expect(map.has("robot-c")).toBe(false);

    // Đổi về slug cũ: slug đó không còn chuyển hướng.
    await products.updateProduct(id, input("robot-a", "SEO-A"));
    map = await loadSlugRedirects();
    expect(map.has("robot-a")).toBe(false);
    expect(map.get("robot-c")).toBe("robot-a");

    // Sản phẩm khác lấy slug cũ: slug đó thuộc sản phẩm mới.
    await products.insertProduct(input("robot-b", "SEO-B"));
    map = await loadSlugRedirects();
    expect(map.has("robot-b")).toBe(false);

    // Bộ nhớ đệm một phút.
    const now = Date.now();
    expect(await findSlugRedirect("robot-c", now)).toBe("robot-a");
    await products.updateProduct(id, input("robot-d", "SEO-A"));
    expect(await findSlugRedirect("robot-a", now + 1000)).toBeNull();
    expect(await findSlugRedirect("robot-a", now + 61_000)).toBe("robot-d");
  });
});
