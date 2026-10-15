import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();

// Nạp sau khi đã đặt DATABASE_URL.
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
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
};

async function stockOf(id: string) {
  return (await products.findProductById(id))!.stock;
}

beforeAll(async () => {
  await getDb();
});

afterAll(cleanup);

describe("dữ liệu mẫu", () => {
  it("chỉ được nạp một lần", async () => {
    const first = await products.queryProducts({ pageSize: 100 });
    expect(first.total).toBe(39);
    expect(first.items[0].slug).toBe("bruticus");

    const db = await getDb();
    const marks = await db.execute("SELECT COUNT(*) AS n FROM meta WHERE key = 'seed:catalog-v3'");
    expect(Number(marks.rows[0].n)).toBe(1);
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
  it("trừ kho, tính tổng và lưu giá tại thời điểm đặt", async () => {
    const nova = (await products.findProductBySlug("strike-freedom-gundam"))!;
    const result = await orders.createOrder({
      ...customer,
      items: [
        { productId: nova.id, quantity: 1, expectedPrice: nova.price },
        { productId: nova.id, quantity: 1, expectedPrice: nova.price },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.order.code).toMatch(/^RB[2-9A-Z]{8}$/);
    expect(result.order.total).toBe(nova.price * 2);
    expect(await stockOf(nova.id)).toBe(nova.stock - 2);

    const saved = (await orders.findOrderByToken(result.order.token))!;
    expect(saved.status).toBe("pending");
    expect(saved.subtotal).toBe(1_980_000);
    expect(saved.shippingFee).toBe(0);
    expect(saved.items).toEqual([
      { productId: nova.id, name: "RG ZGMF-X20A Strike Freedom Gundam", slug: "strike-freedom-gundam", image: nova.image, unitPrice: nova.price, quantity: 2 },
    ]);
  });

  it("từ chối khi giá đã đổi so với giỏ hàng", async () => {
    const retro = (await products.findProductBySlug("chars-zaku-ii"))!;
    const result = await orders.createOrder({
      ...customer,
      items: [{ productId: retro.id, quantity: 1, expectedPrice: retro.price - 1 }],
    });
    expect(result).toMatchObject({ ok: false, reason: "cart_changed", issues: [{ reason: "price_changed" }] });
    expect(await stockOf(retro.id)).toBe(retro.stock);
  });

  it("từ chối khi vượt tồn kho hoặc sản phẩm không tồn tại", async () => {
    const orion = (await products.findProductBySlug("gundam-phenex"))!;
    const result = await orders.createOrder({
      ...customer,
      items: [
        { productId: orion.id, quantity: orion.stock + 1, expectedPrice: orion.price },
        { productId: "khong-ton-tai", quantity: 1, expectedPrice: 1 },
      ],
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ reason: "insufficient_stock" }, { reason: "unavailable" }],
    });
    expect(await stockOf(orion.id)).toBe(orion.stock);
  });

  it("giỏ rỗng hoặc số lượng không hợp lệ thì không tạo đơn", async () => {
    const result = await orders.createOrder({ ...customer, items: [{ productId: "x", quantity: 0, expectedPrice: 1 }] });
    expect(result).toMatchObject({ ok: false, reason: "empty" });
  });

  it("ràng buộc trong CSDL huỷ toàn bộ đơn nếu kho bị bán hết giữa chừng", async () => {
    const titan = (await products.findProductBySlug("sazabi"))!;
    const axis = (await products.findProductBySlug("wing-gundam"))!;
    const db = await getDb();
    const before = Number((await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n);

    // Mô phỏng hai khách cùng mua hết số Titan còn lại: cả hai đều vượt qua bước kiểm tra ban đầu.
    const draft = {
      ...customer,
      items: [
        { productId: axis.id, quantity: 1, expectedPrice: axis.price },
        { productId: titan.id, quantity: titan.stock, expectedPrice: titan.price },
      ],
    };
    const results = await Promise.all([orders.createOrder(draft), orders.createOrder(draft)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ reason: "cart_changed", issues: [{ reason: "insufficient_stock" }] });
    expect(await stockOf(titan.id)).toBe(0);
    // Đơn thất bại không được trừ kho của sản phẩm còn lại trong cùng giỏ.
    expect(await stockOf(axis.id)).toBe(axis.stock - 1);
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM orders")).rows[0].n)).toBe(before + 1);
  });
});

describe("vòng đời đơn hàng", () => {
  it("chỉ cho chuyển trạng thái theo đúng thứ tự và đánh dấu COD đã thu khi hoàn tất", async () => {
    const pico = (await products.findProductBySlug("gundam-exia"))!;
    const created = await orders.createOrder({
      ...customer,
      items: [{ productId: pico.id, quantity: 1, expectedPrice: pico.price }],
    });
    if (!created.ok) throw new Error("không tạo được đơn");
    const { id } = created.order;

    expect(await orders.advanceOrder(id, "shipping")).toBe(false);
    expect(await orders.advanceOrder(id, "confirmed")).toBe(true);
    expect(await orders.advanceOrder(id, "confirmed")).toBe(false);
    expect(await orders.advanceOrder(id, "shipping")).toBe(true);
    expect(await orders.advanceOrder(id, "completed")).toBe(true);

    const done = (await orders.findOrderById(id))!;
    expect(done.status).toBe("completed");
    expect(done.paymentStatus).toBe("paid");
    // Đơn đã hoàn tất thì không huỷ được nữa.
    expect(await orders.cancelOrder(id, ["pending", "confirmed", "shipping", "completed"])).toBe(false);
    expect(await stockOf(pico.id)).toBe(pico.stock - 1);
  });

  it("huỷ đơn trả hàng về kho đúng một lần", async () => {
    const bolt = (await products.findProductBySlug("bumblebee"))!;
    const created = await orders.createOrder({
      ...customer,
      items: [{ productId: bolt.id, quantity: 3, expectedPrice: bolt.price }],
    });
    if (!created.ok) throw new Error("không tạo được đơn");
    expect(await stockOf(bolt.id)).toBe(bolt.stock - 3);

    // Khách chỉ được huỷ khi đơn còn chờ xác nhận.
    expect(await orders.cancelOrder(created.order.id, ["pending"])).toBe(true);
    expect(await orders.cancelOrder(created.order.id, ["pending"])).toBe(false);
    expect(await stockOf(bolt.id)).toBe(bolt.stock);
    expect((await products.findProductById(bolt.id))!.sold).toBe(0);
    expect((await orders.findOrderById(created.order.id))!.status).toBe("cancelled");
  });

  it("tra cứu đơn cần khớp cả mã lẫn số điện thoại", async () => {
    const terra = (await products.findProductBySlug("arcee"))!;
    const created = await orders.createOrder({
      ...customer,
      customerPhone: "0987654321",
      items: [{ productId: terra.id, quantity: 1, expectedPrice: terra.price }],
    });
    if (!created.ok) throw new Error("không tạo được đơn");

    expect(await orders.findOrderTokenByCodeAndPhone(created.order.code, "0987654321")).toBe(created.order.token);
    expect(await orders.findOrderTokenByCodeAndPhone(created.order.code, "0900000000")).toBeNull();
  });

  it("trang quản trị lọc đơn theo mã, và không xoá sản phẩm đã có trong đơn", async () => {
    const product = (await products.findProductBySlug("arcee"))!;
    const created = await orders.createOrder({
      ...customer,
      items: [{ productId: product.id, quantity: 1, expectedPrice: product.price }],
    });
    if (!created.ok) throw new Error("không tạo được đơn");

    const byCode = await orders.listOrders({ code: created.order.code });
    expect(byCode.items.map((o) => o.id)).toEqual([created.order.id]);
    expect((await orders.listOrders({ code: created.order.code, status: "completed" })).total).toBe(0);
    expect((await orders.listOrders({ userId: "khong-co" })).total).toBe(0);
    expect((await orders.listOrders({})).total).toBeGreaterThan(1);

    expect(await products.deleteProduct(product.id)).toBe(false);
    expect(await products.findProductById(product.id)).not.toBeNull();

    const unsold = (await products.findProductBySlug("muteki-shogun"))!;
    expect(await products.deleteProduct(unsold.id)).toBe(true);
    expect(await products.findProductById(unsold.id)).toBeNull();
  });

  it("thống kê đếm đơn theo trạng thái và doanh thu đơn hoàn tất", async () => {
    const stats = await orders.getOrderStats();
    expect(stats.byStatus.completed).toBe(1);
    expect(stats.byStatus.cancelled).toBe(1);
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
