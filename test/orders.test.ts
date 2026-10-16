import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();

// Nạp sau khi đã đặt DATABASE_URL.
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const inventory = await import("@/server/repo/inventory");
const rateLimit = await import("@/server/repo/rate-limit");

const customer = {
  userId: null,
  paymentMethod: "cod" as const,
  customerName: "Nguyễn Văn A",
  customerPhone: "0901234567",
  customerEmail: "",
  shippingAddress: "12 Lê Lợi",
  shippingCity: "Đà Nẵng",
  note: "",
  idempotencyKey: null,
};

// Số có thể bán (on_hand − reserved) của biến thể mặc định.
async function stockOf(id: string) {
  return (await products.findProductById(id))!.stock;
}

async function balanceOf(variantId: string) {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT on_hand, reserved FROM inventory WHERE variant_id = ?", args: [variantId] })).rows[0];
  return { onHand: Number(row.on_hand), reserved: Number(row.reserved) };
}

const order = async (slug: string, quantity = 1, extra: Partial<typeof customer> = {}) => {
  const product = (await products.findProductBySlug(slug))!;
  const created = await orders.createOrder({
    ...customer,
    ...extra,
    items: [{ variantId: product.variantId, quantity, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error(`không tạo được đơn ${slug}`);
  return { product, order: created.order };
};

beforeAll(async () => {
  await getDb();
});

// Sổ kho và số dư phải luôn khớp sau mọi thao tác (YC-KHO-18).
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
});

afterAll(cleanup);

describe("dữ liệu mẫu", () => {
  it("chỉ được nạp một lần, mỗi sản phẩm có một biến thể mặc định và tồn qua phiếu PN-SEED", async () => {
    const first = await products.queryProducts({ pageSize: 100 });
    expect(first.total).toBe(39);
    expect(first.items[0].slug).toBe("bruticus");

    const db = await getDb();
    const [marks, variants, documents] = await db.batch([
      "SELECT COUNT(*) AS n FROM meta WHERE key = 'seed:catalog-v4'",
      "SELECT COUNT(*) AS n FROM product_variants WHERE is_default",
      "SELECT status FROM stock_documents WHERE code = 'PN-SEED'",
    ]);
    expect(Number(marks.rows[0].n)).toBe(1);
    expect(Number(variants.rows[0].n)).toBe(39);
    expect(documents.rows).toEqual([{ status: "posted" }]);

    const bruticus = (await products.findProductBySlug("bruticus"))!;
    expect(bruticus.stock).toBe(4);
    expect(bruticus.variants).toMatchObject([{ sku: "RB-BRUTICUS", isDefault: true, stock: 4 }]);
  });

  it("tìm kiếm không phân biệt dấu và lọc theo danh mục", async () => {
    const byText = await products.queryProducts({ q: "tuong quan" });
    expect(byText.items.map((p) => p.slug)).toEqual(["muteki-shogun"]);

    const byCategory = await products.queryProducts({ category: "super-sentai", sort: "gia-tang" });
    expect(byCategory.items.map((p) => p.slug)).toEqual(["muteki-shogun", "wild-force-megazord"]);

    const wildcard = await products.queryProducts({ q: "%" });
    expect(wildcard.total).toBe(0);
  });

  it("phân trang đúng tổng số", async () => {
    const page2 = await products.queryProducts({ page: 2, pageSize: 5 });
    expect(page2.total).toBe(39);
    expect(page2.items).toHaveLength(5);
  });
});

describe("tạo đơn hàng", () => {
  it("giữ hàng (chưa trừ tồn thực), tính tổng và lưu giá, SKU tại thời điểm đặt", async () => {
    const nova = (await products.findProductBySlug("strike-freedom-gundam"))!;
    const before = await balanceOf(nova.variantId);
    const result = await orders.createOrder({
      ...customer,
      items: [
        { variantId: nova.variantId, quantity: 1, expectedPrice: nova.price },
        { variantId: nova.variantId, quantity: 1, expectedPrice: nova.price },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.order.code).toMatch(/^RB[2-9A-Z]{8}$/);
    expect(result.order.total).toBe(nova.price * 2);
    expect(await stockOf(nova.id)).toBe(nova.stock - 2);
    expect(await balanceOf(nova.variantId)).toEqual({ onHand: before.onHand, reserved: before.reserved + 2 });

    const saved = (await orders.findOrderByToken(result.order.token))!;
    expect(saved.status).toBe("pending");
    expect(saved.subtotal).toBe(1_980_000);
    expect(saved.shippingFee).toBe(0);
    expect(saved.items).toEqual([
      {
        productId: nova.id,
        variantId: nova.variantId,
        name: "RG ZGMF-X20A Strike Freedom Gundam",
        variantName: "Bản thường",
        sku: "RB-STRIKE-FREEDOM-GUNDAM",
        slug: "strike-freedom-gundam",
        image: nova.image,
        unitPrice: nova.price,
        quantity: 2,
      },
    ]);
  });

  it("từ chối khi giá đã đổi so với giỏ hàng", async () => {
    const retro = (await products.findProductBySlug("chars-zaku-ii"))!;
    const result = await orders.createOrder({
      ...customer,
      items: [{ variantId: retro.variantId, quantity: 1, expectedPrice: retro.price - 1 }],
    });
    expect(result).toMatchObject({ ok: false, reason: "cart_changed", issues: [{ reason: "price_changed" }] });
    expect(await stockOf(retro.id)).toBe(retro.stock);
  });

  it("WH-03: từ chối khi vượt số có thể bán hoặc biến thể không tồn tại", async () => {
    const orion = (await products.findProductBySlug("gundam-phenex"))!;
    const result = await orders.createOrder({
      ...customer,
      items: [
        { variantId: orion.variantId, quantity: orion.stock + 1, expectedPrice: orion.price },
        { variantId: "khong-ton-tai", quantity: 1, expectedPrice: 1 },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ reason: "insufficient_stock" }, { reason: "unavailable" }],
    });
    expect(await stockOf(orion.id)).toBe(orion.stock);
  });

  it("EC-01: sản phẩm bản nháp không hiện ở cửa hàng và không đặt được dù còn tồn", async () => {
    const db = await getDb();
    const draft = (await products.findProductBySlug("zeta-gundam"))!;
    expect(draft.stock).toBeGreaterThan(0);
    await db.execute({ sql: "UPDATE products SET status = 'draft' WHERE id = ?", args: [draft.id] });

    expect((await products.queryProducts({ q: "zeta gundam" })).total).toBe(0);
    const result = await orders.createOrder({
      ...customer,
      items: [{ variantId: draft.variantId, quantity: 1, expectedPrice: draft.price }],
    });
    expect(result).toMatchObject({ ok: false, issues: [{ reason: "unavailable" }] });
    await db.execute({ sql: "UPDATE products SET status = 'published' WHERE id = ?", args: [draft.id] });
  });

  it("giỏ rỗng hoặc số lượng không hợp lệ thì không tạo đơn", async () => {
    const result = await orders.createOrder({ ...customer, items: [{ variantId: "x", quantity: 0, expectedPrice: 1 }] });
    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it("EC-02: hai khách cùng đặt hết số còn lại thì chỉ một đơn thành công", async () => {
    const titan = (await products.findProductBySlug("sazabi"))!;
    const axis = (await products.findProductBySlug("wing-gundam"))!;
    const db = await getDb();
    const before = Number((await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n);

    // Cả hai đều vượt qua bước kiểm tra ban đầu; ràng buộc reserved ≤ on_hand trong CSDL chặn đơn thứ hai.
    const draft = {
      ...customer,
      items: [
        { variantId: axis.variantId, quantity: 1, expectedPrice: axis.price },
        { variantId: titan.variantId, quantity: titan.stock, expectedPrice: titan.price },
      ],
    };
    const results = await Promise.all([orders.createOrder(draft), orders.createOrder(draft)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "cart_changed", issues: [{ reason: "insufficient_stock" }] });
    expect(await stockOf(titan.id)).toBe(0);
    // Đơn thất bại không được giữ hàng của sản phẩm còn lại trong cùng giỏ.
    expect(await stockOf(axis.id)).toBe(axis.stock - 1);
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n)).toBe(before + 1);
  });

  it("EC-05: bấm đặt hàng hai lần với cùng mã chỉ tạo một đơn và một lần giữ hàng", async () => {
    const product = (await products.findProductBySlug("rx-78-2-gundam"))!;
    const draft = {
      ...customer,
      idempotencyKey: "a".repeat(32),
      items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
    };
    const [first, second] = await Promise.all([orders.createOrder(draft), orders.createOrder(draft)]);
    const third = await orders.createOrder(draft);
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) return;
    expect(second.order.id).toBe(first.order.id);
    expect(third.order.id).toBe(first.order.id);
    expect(await stockOf(product.id)).toBe(product.stock - 1);
  });

  it("EC-03: đổi giá sau khi đặt thì đơn cũ giữ giá lúc đặt", async () => {
    const { product, order: created } = await order("gundam-exia");
    const db = await getDb();
    await db.execute({ sql: "UPDATE product_variants SET price = price + 100000 WHERE id = ?", args: [product.variantId] });
    const saved = (await orders.findOrderById(created.id))!;
    expect(saved.items[0].unitPrice).toBe(product.price);
    expect(saved.total).toBe(created.total);
    await db.execute({ sql: "UPDATE product_variants SET price = ? WHERE id = ?", args: [product.price, product.variantId] });
    await orders.cancelOrder(created.id, ["pending"]);
  });
});

describe("vòng đời đơn hàng", () => {
  it("chuyển trạng thái đúng thứ tự, xuất kho khi giao, đánh dấu COD đã thu khi hoàn tất", async () => {
    const { product, order: created } = await order("gundam-exia");
    const { id } = created;
    const before = await balanceOf(product.variantId);

    expect(await orders.advanceOrder(id, "shipping")).toBe(false);
    expect(await orders.advanceOrder(id, "confirmed")).toBe(true);
    expect(await orders.advanceOrder(id, "confirmed")).toBe(false);
    expect(await orders.advanceOrder(id, "shipping")).toBe(true);
    // Xuất kho: tồn thực và số đang giữ cùng giảm; bàn giao lần hai không xuất thêm.
    expect(await balanceOf(product.variantId)).toEqual({ onHand: before.onHand - 1, reserved: before.reserved - 1 });
    expect(await orders.advanceOrder(id, "shipping")).toBe(false);
    expect(await orders.advanceOrder(id, "completed")).toBe(true);

    const done = (await orders.findOrderById(id))!;
    expect(done.status).toBe("completed");
    expect(done.paymentStatus).toBe("paid");
    // Đơn đã hoàn tất hoặc đã xuất kho thì không huỷ được nữa.
    expect(await orders.cancelOrder(id, ["pending", "confirmed", "shipping", "completed"])).toBe(false);
    expect(await stockOf(product.id)).toBe(product.stock - 1);
  });

  it("huỷ đơn giải phóng hàng đã giữ đúng một lần, kể cả khi huỷ song song", async () => {
    const { product, order: created } = await order("bumblebee", 3);
    expect(await stockOf(product.id)).toBe(product.stock - 3);

    const results = await Promise.all([
      orders.cancelOrder(created.id, ["pending"]),
      orders.cancelOrder(created.id, ["pending"]),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await orders.cancelOrder(created.id, ["pending"])).toBe(false);
    expect(await stockOf(product.id)).toBe(product.stock);
    expect((await orders.findOrderById(created.id))!.status).toBe("cancelled");
  });

  it("tra cứu đơn cần khớp cả mã lẫn số điện thoại", async () => {
    const { order: created } = await order("arcee", 1, { customerPhone: "0987654321" });
    expect(await orders.findOrderTokenByCodeAndPhone(created.code, "0987654321")).toBe(created.token);
    expect(await orders.findOrderTokenByCodeAndPhone(created.code, "0900000000")).toBeNull();
  });

  it("trang quản trị lọc đơn theo mã; không xoá sản phẩm đã có trong đơn hoặc sổ kho", async () => {
    const { product, order: created } = await order("arcee");

    const byCode = await orders.listOrders({ code: created.code });
    expect(byCode.items.map((o) => o.id)).toEqual([created.id]);
    expect((await orders.listOrders({ code: created.code, status: "completed" })).total).toBe(0);
    expect((await orders.listOrders({ userId: "khong-co" })).total).toBe(0);
    expect((await orders.listOrders({})).total).toBeGreaterThan(1);

    expect(await products.deleteProduct(product.id)).toBe(false);
    expect(await products.findProductById(product.id)).not.toBeNull();
    // Chưa bán nhưng đã nhập kho (có dòng sổ kho) cũng không xoá được.
    const stocked = (await products.findProductBySlug("muteki-shogun"))!;
    expect(await products.deleteProduct(stocked.id)).toBe(false);
  });

  it("tạo, sửa và xoá sản phẩm mới chưa có giao dịch", async () => {
    const input = {
      slug: "robot-thu",
      name: "Robot thử",
      tagline: "",
      description: "",
      category: "figure",
      sku: "RB-THU-01",
      price: 500_000,
      compareAtPrice: null,
      model: "humanoid" as const,
      modelUrl: null,
      colors: { primary: "#111111", secondary: "#222222", accent: "#333333" },
      specs: [],
      isFeatured: false,
      status: "draft" as const,
    };
    const id = await products.insertProduct(input);
    expect(await products.updateProduct(id, { ...input, price: 600_000, status: "published" })).toBe(true);
    const saved = (await products.findProductById(id))!;
    expect(saved).toMatchObject({ price: 600_000, status: "published", stock: 0, isActive: true });
    expect(saved.variants).toMatchObject([{ sku: "RB-THU-01", price: 600_000 }]);
    await expect(products.insertProduct({ ...input, slug: "robot-thu-2" })).rejects.toThrow();
    expect(await products.deleteProduct(id)).toBe(true);
    expect(await products.findProductById(id)).toBeNull();
  });

  it("thống kê đếm đơn theo trạng thái và doanh thu đơn hoàn tất", async () => {
    const stats = await orders.getOrderStats();
    expect(stats.byStatus.completed).toBe(1);
    expect(stats.byStatus.cancelled).toBe(2);
    expect(stats.revenue).toBe(1_090_000);
    expect(stats.totalOrders).toBe(Object.values(stats.byStatus).reduce((a, b) => a + b, 0));
    expect(stats.lowStock.map((p) => p.name)).toContain("RG MSN-04 Sazabi");
  });
});

describe("giới hạn tần suất", () => {
  it("chặn sau khi vượt số lần cho phép và mở lại khi hết cửa sổ", async () => {
    const key = "test:login";
    expect((await rateLimit.consumeRateLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await rateLimit.consumeRateLimit(key, 2, 60_000)).allowed).toBe(true);
    const blocked = await rateLimit.consumeRateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    await rateLimit.resetRateLimit(key);
    expect((await rateLimit.consumeRateLimit(key, 2, 60_000)).allowed).toBe(true);

    // Cửa sổ 0 ms hết hạn ngay nên lần gọi sau bắt đầu đếm lại từ 1.
    await rateLimit.consumeRateLimit("test:expired", 1, 0);
    expect((await rateLimit.consumeRateLimit("test:expired", 1, 60_000)).allowed).toBe(true);
  });
});
