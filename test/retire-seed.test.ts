import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb, retireSeedProducts } = await import("@/server/db");
const { RETIRED_SEED_SLUGS, SEED_PRODUCTS } = await import("@/server/db/seed-data");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("mẫu bị loại vì mô hình 3D không đạt chuẩn", () => {
  it("dữ liệu mẫu không còn chứa các mẫu đã loại", () => {
    const slugs = new Set(SEED_PRODUCTS.map((p) => p.slug));
    for (const slug of RETIRED_SEED_SLUGS) expect(slugs.has(slug), slug).toBe(false);
  });

  it("CSDL đã nạp mẫu cũ: chuyển các mẫu đó sang archived, giữ bản ghi, không đụng sản phẩm khác", async () => {
    const db = await getDb();
    // Dựng lại tình trạng CSDL cũ: hai sản phẩm mang slug của mẫu đã loại, còn đang bán.
    await db.execute({ sql: "UPDATE products SET slug = ?, is_featured = true WHERE slug = ?", args: [RETIRED_SEED_SLUGS[0], "muteki-shogun"] });
    await db.execute({ sql: "UPDATE products SET slug = ?, is_featured = true WHERE slug = ?", args: [RETIRED_SEED_SLUGS[1], "wild-force-megazord"] });

    await retireSeedProducts((statement) => db.execute(statement));

    const rows = (await db.execute({ sql: "SELECT slug, status, is_featured FROM products WHERE slug IN (?, ?)", args: [RETIRED_SEED_SLUGS[0], RETIRED_SEED_SLUGS[1]] })).rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ status: "archived", is_featured: false });
    const published = (await db.execute("SELECT COUNT(*) AS n FROM products WHERE status = 'published'")).rows[0].n;
    expect(Number(published)).toBe(SEED_PRODUCTS.length - 2);
  });
});