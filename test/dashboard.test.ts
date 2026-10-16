import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const dashboard = await import("@/server/repo/dashboard");
const orders = await import("@/server/repo/orders");
const products = await import("@/server/repo/products");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

const customer = { userId: null, customerName: "Khách", customerPhone: "0901234567", customerEmail: "", shippingAddress: "1 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null };

describe("trang tổng quan (T13)", () => {
  it("đơn hôm nay, tỷ lệ huỷ, bán chạy, chuyển khoản quá 48 giờ, chờ hoàn tiền", async () => {
    const product = (await products.findProductBySlug("grimlock"))!;
    const place = (paymentMethod: "cod" | "bank", quantity = 1) =>
      orders.createOrder({ ...customer, paymentMethod, items: [{ variantId: product.variantId, quantity, expectedPrice: product.price }] });
    const a = await place("cod", 2);
    const b = await place("bank");
    const c = await place("bank");
    if (!a.ok || !b.ok || !c.ok) throw new Error("không tạo được đơn");
    await orders.applyOrderAction(b.order.id, "mark_paid");
    await orders.applyOrderAction(b.order.id, "cancel");
    // Đơn c đặt cách đây 3 ngày, chưa chuyển khoản.
    const db = await getDb();
    await db.execute({ sql: "UPDATE orders SET created_at = created_at - 3 * 86400000::bigint WHERE id = ?", args: [c.order.id] });

    const store = await dashboard.storeDashboard();
    expect(store.ordersToday).toBe(2);
    expect(store.revenueToday).toBe(a.order.total);
    expect(store).toMatchObject({ orders30: 3, cancelled30: 1, overdueTransfers: 1, refundPending: 1 });
    expect(store.bestSellers[0]).toMatchObject({ productId: product.id, quantity: 3 });
  });

  it("kho: tổng có thể bán, SKU dưới ngưỡng và hết hàng", async () => {
    const stock = await dashboard.stockDashboard();
    const db = await getDb();
    const expected = await db.execute(
      "SELECT SUM(GREATEST(on_hand - reserved, 0)) AS a, COUNT(*) FILTER (WHERE on_hand - reserved BETWEEN 1 AND low_stock_threshold) AS l FROM inventory",
    );
    expect(stock.available).toBe(Number(expected.rows[0].a));
    expect(stock.lowStockSkus).toBe(Number(expected.rows[0].l));
    expect(stock.outOfStockSkus).toBeGreaterThanOrEqual(0);
  });
});
