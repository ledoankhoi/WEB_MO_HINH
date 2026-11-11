import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const { jsonLdScript, productJsonLd } = await import("@/lib/structured-data");
const robots = (await import("@/app/robots")).default;

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("SEO", () => {
  it("dữ liệu cấu trúc Product: giá VND, tình trạng hàng, điểm đánh giá khi có", async () => {
    const product = (await products.findProductBySlug("bruticus"))!;
    const data = productJsonLd(product, { average: 4.5, count: 2 }, "https://shop.vn");
    expect(data).toMatchObject({
      "@type": "Product",
      name: product.name,
      url: "https://shop.vn/san-pham/bruticus",
      offers: { priceCurrency: "VND", price: product.price, availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
      aggregateRating: { ratingValue: 4.5, reviewCount: 2 },
    });
    expect(productJsonLd(product, { average: 0, count: 0 }, "https://shop.vn")).not.toHaveProperty("aggregateRating");
    const preorder = { ...product, variants: product.variants.map((v) => ({ ...v, preorder: { id: "x", status: "open" as const, expectedAt: 1, depositPercent: 30, left: null, note: "" } })) };
    expect((productJsonLd(preorder, { average: 0, count: 0 }, "https://shop.vn").offers as { availability: string }).availability).toBe("https://schema.org/PreOrder");
  });

  it("nhúng an toàn trong thẻ script; robots chặn quản trị, API và trang riêng của khách", () => {
    expect(jsonLdScript({ name: "</script><script>alert(1)</script>" })).not.toContain("</script>");
    const rules = robots().rules as { disallow: string[] };
    expect(rules.disallow).toEqual(expect.arrayContaining(["/admin", "/api/", "/thanh-toan", "/tai-khoan", "/don-hang/"]));
  });
});
