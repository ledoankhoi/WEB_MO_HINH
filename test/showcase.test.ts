import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { newId, newToken } = await import("@/server/ids");
const users = await import("@/server/repo/users");
const { getShowcaseStats, listRanking } = await import("@/server/repo/showcase");

type Pick = { productId: string; variantId: string; slug: string };
let products: Pick[];

async function order(status: string, lines: [Pick, number][]) {
  const db = await getDb();
  const id = newId();
  await db.execute({
    sql: `INSERT INTO orders (id, code, token, status, payment_method, customer_name, customer_phone, shipping_address, shipping_city,
            subtotal, shipping_fee, total, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'cod', 'Khách', '0912345678', '1 Lê Lợi', 'Hà Nội', 0, 0, 0, ?, ?)`,
    args: [id, `RB-${id.slice(0, 8)}`, newToken(), status, Date.now(), Date.now()],
  });
  for (const [item, quantity] of lines) {
    await db.execute({
      sql: `INSERT INTO order_items (order_id, variant_id, product_id, product_name, variant_name, sku, product_slug, unit_price, quantity)
            VALUES (?, ?, ?, 'x', 'Bản thường', 'SKU', ?, 1000, ?)`,
      args: [id, item.variantId, item.productId, item.slug, quantity],
    });
  }
}

beforeAll(async () => {
  const db = await getDb();
  const rows = await db.execute("SELECT id, variant_id, slug FROM product_list WHERE is_active ORDER BY created_at DESC, id LIMIT 4");
  products = rows.rows.map((row) => ({ productId: String(row.id), variantId: String(row.variant_id), slug: String(row.slug) }));
});
afterAll(cleanup);

describe("trưng bày (/trung-bay)", () => {
  it("bán chạy: cộng số lượng các đơn đã xác nhận trở lên, không tính đơn chờ xác nhận, đơn huỷ", async () => {
    const [a, b, c] = products;
    await order("completed", [[a, 2], [b, 5]]);
    await order("processing", [[a, 4]]);
    await order("cancelled", [[c, 50]]);
    await order("pending", [[c, 40]]);
    const ranking = await listRanking("ban-chay", 10);
    expect(ranking.map((r) => [r.product.slug, r.value])).toEqual([
      [a.slug, 6],
      [b.slug, 5],
    ]);
  });

  it("yêu thích, chờ hàng: đếm đúng, cao trước; sản phẩm ngừng bán không vào bảng", async () => {
    const db = await getDb();
    const [a, b, , d] = products;
    const fans = await Promise.all(["f1", "f2", "f3"].map((name) => users.insertUser({ email: `${name}@example.com`, name, phone: "", passwordHash: "x" })));
    for (const userId of fans) await db.execute({ sql: "INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)", args: [userId, b.productId, Date.now()] });
    await db.execute({ sql: "INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)", args: [fans[0], a.productId, Date.now()] });
    await db.execute({ sql: "INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)", args: [fans[1], d.productId, Date.now()] });
    await db.execute({ sql: "UPDATE products SET status = 'archived' WHERE id = ?", args: [d.productId] });
    expect((await listRanking("yeu-thich", 10)).map((r) => [r.product.slug, r.value])).toEqual([
      [b.slug, 3],
      [a.slug, 1],
    ]);

    await db.execute({
      sql: "INSERT INTO stock_alerts (id, variant_id, contact, contact_kind, created_at) VALUES (?, ?, 'a@example.com', 'email', ?), (?, ?, 'b@example.com', 'email', ?)",
      args: [newId(), a.variantId, Date.now(), newId(), a.variantId, Date.now()],
    });
    expect((await listRanking("cho-hang", 10)).map((r) => [r.product.slug, r.value])).toEqual([[a.slug, 2]]);
  });

  it("mới về: mới nhất trước; con số tổng quan", async () => {
    const newest = await listRanking("moi-ve", 3);
    expect(newest[0].value).toBeGreaterThanOrEqual(newest[1].value);
    const stats = await getShowcaseStats();
    expect(stats.sold).toBe(11);
    expect(stats.products).toBeGreaterThan(0);
    expect(stats.transformable).toBeGreaterThan(0);
  });

  it("thanh menu có link Trưng bày", async () => {
    const db = await getDb();
    const links = await db.execute("SELECT label FROM nav_items WHERE menu = 'header' AND url = '/trung-bay' AND is_active");
    expect(links.rows.map((row) => row.label)).toEqual(["Trưng bày"]);
  });
});
