import { afterAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();

const { isConstraintError } = await import("@/server/db");
const users = await import("@/server/repo/users");
const products = await import("@/server/repo/products");

afterAll(cleanup);

describe("tài khoản và phiên đăng nhập", () => {
  it("email là duy nhất; phiên còn hạn trả về người dùng, phiên hết hạn thì không", async () => {
    const id = await users.insertUser({ email: "a@example.com", name: "An", phone: "", passwordHash: "x" });
    await expect(users.insertUser({ email: "a@example.com", name: "B", phone: "", passwordHash: "y" })).rejects.toSatisfy(
      isConstraintError,
    );

    await users.insertSession("con-han", id, Date.now() + 60_000);
    await users.insertSession("het-han", id, Date.now() - 1);
    expect(await users.findSessionUser("con-han")).toMatchObject({ id, email: "a@example.com", role: "customer" });
    expect(await users.findSessionUser("het-han")).toBeNull();
    // Cửa đăng nhập dựa vào cờ này để tách tài khoản khách với quản trị viên.
    expect(await users.findCredentialsByEmail("a@example.com")).toMatchObject({ id, isAdmin: false });

    // Đổi mật khẩu đăng xuất mọi phiên khác.
    await users.insertSession("thiet-bi-khac", id, Date.now() + 60_000);
    await users.updateUserPassword(id, "moi", "con-han");
    expect(await users.findSessionUser("thiet-bi-khac")).toBeNull();
    expect(await users.findSessionUser("con-han")).not.toBeNull();
  });

  it("danh sách khách hàng kèm số đơn, không gồm quản trị viên", async () => {
    const { items, total } = await users.listCustomers({});
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ email: "a@example.com", orderCount: 0, spent: 0 });
    expect((await users.listCustomers({ page: 2 })).items).toEqual([]);
  });
});

describe("sản phẩm", () => {
  it("sắp xếp theo tên không phân biệt hoa thường", async () => {
    const { items } = await products.queryProducts({ sort: "ten", pageSize: 3 });
    expect(items.map((p) => p.name)).toEqual(["Arcee Transformers Prime Deluxe", "B-127 Transformers One Deluxe", "Blast Off Combaticon"]);
  });

  it("lưu và đọc lại ảnh đại diện nhị phân nguyên vẹn", async () => {
    const product = (await products.findProductBySlug("strike-freedom-gundam"))!;
    const bytes = new Uint8Array([82, 73, 70, 70, 0, 255, 128, 7]);
    const url = await products.saveProductImage(product.id, bytes.buffer, "image/webp");

    expect(url).toMatch(new RegExp(`^/media/${product.id}-\\d+$`));
    expect((await products.findProductBySlug("strike-freedom-gundam"))!.image).toBe(url);
    const stored = (await products.findProductImage(product.id))!;
    expect(stored.contentType).toBe("image/webp");
    expect([...stored.data]).toEqual([...bytes]);
  });
});
