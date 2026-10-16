import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const users = await import("@/server/repo/users");
const wishlist = await import("@/server/repo/wishlist");

let userId: string;
let products: string[];
beforeAll(async () => {
  const db = await getDb();
  userId = await users.insertUser({ email: "thich@example.com", name: "Người Thích", phone: "", passwordHash: "x" });
  products = (await db.execute("SELECT id FROM products WHERE status = 'published' ORDER BY slug LIMIT 2")).rows.map((r) => String(r.id));
});
afterAll(cleanup);

describe("yêu thích (T20)", () => {
  it("YC-DG-03: thêm, bỏ, không trùng; sản phẩm không bán thì không thêm được", async () => {
    expect(await wishlist.addToWishlist(userId, products[0])).toBe(true);
    expect(await wishlist.addToWishlist(userId, products[0])).toBe(false);
    expect(await wishlist.addToWishlist(userId, products[1])).toBe(true);
    expect(await wishlist.addToWishlist(userId, "khong-co")).toBe(false);
    expect((await wishlist.listWishlistIds(userId)).sort()).toEqual([...products].sort());
    expect((await wishlist.listWishlistProducts(userId)).map((p) => p.id).sort()).toEqual([...products].sort());

    expect(await wishlist.removeFromWishlist(userId, products[1])).toBe(true);
    expect(await wishlist.removeFromWishlist(userId, products[1])).toBe(false);
    expect(await wishlist.listWishlistIds(userId)).toEqual([products[0]]);
    expect(await wishlist.topWishlisted(5)).toMatchObject([{ id: products[0], count: 1 }]);
  });
});
