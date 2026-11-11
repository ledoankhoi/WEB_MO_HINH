import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const orders = await import("@/server/repo/orders");
const { ACTION_STAGES, ORDER_STAGE_KEYS, ORDER_STAGES, orderProgress, orderStage } = await import("@/lib/order-stage");
const { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, SHIPPING_STATUSES } = await import("@/lib/catalog");
const { ORDER_PREORDER_STATUSES } = await import("@/lib/preorder");

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

type Key = Parameters<typeof orders.applyOrderAction>[1];

async function place(paymentMethod: "cod" | "bank", steps: Key[]) {
  const product = (await products.findProductBySlug("zaku-machine-gun"))!;
  const created = await orders.createOrder({
    userId: null,
    paymentMethod,
    customerName: "Khách",
    customerPhone: "0901234567",
    customerEmail: "",
    shippingAddress: "1 Lê Lợi",
    shippingCity: "Huế",
    note: "",
    idempotencyKey: null,
    items: [{ variantId: product.variantId, quantity: 1, expectedPrice: product.price }],
  });
  if (!created.ok) throw new Error("không đặt được đơn");
  for (const key of steps) {
    const ok = await orders.applyOrderAction(created.order.id, key, undefined, key === "hand_over" ? { tracking: { carrier: "GHN", code: `GHN${created.order.code}` } } : {});
    if (!ok) throw new Error(`không làm được ${key}`);
  }
  return created.order.id;
}

describe("bước xử lý đơn hàng", () => {
  it("mọi tổ hợp trạng thái rơi vào đúng một bước", () => {
    for (const status of ORDER_STATUSES)
      for (const paymentStatus of PAYMENT_STATUSES)
        for (const shippingStatus of SHIPPING_STATUSES)
          for (const paymentMethod of PAYMENT_METHODS)
            for (const depositAmount of [0, 50_000])
              for (const preorderStatus of ORDER_PREORDER_STATUSES) {
                const state = { status, paymentStatus, shippingStatus, paymentMethod, depositAmount, preorderStatus };
                const matches = ORDER_STAGE_KEYS.filter((key) => ORDER_STAGES[key].match(state));
                expect(matches.length, JSON.stringify(state)).toBeLessThanOrEqual(1);
              }
  });

  it("đếm, lọc và xếp ưu tiên trên CSDL khớp với nhãn ở giao diện", async () => {
    const shipped: Key[] = ["confirm", "start_packing", "packed", "hand_over"];
    const expected = {
      "cho-xac-nhan": await place("cod", []),
      "cho-chuyen-khoan": await place("bank", []),
      "cho-dong-goi": await place("cod", ["confirm"]),
      "dang-dong-goi": await place("cod", ["confirm", "start_packing"]),
      "cho-ban-giao": await place("cod", ["confirm", "start_packing", "packed"]),
      "dang-giao": await place("cod", shipped),
      "giao-that-bai": await place("cod", [...shipped, "delivery_failed"]),
      "cho-thu-tien": await place("cod", [...shipped, "delivered"]),
      "hoan-tat": await place("cod", [...shipped, "delivered", "mark_paid"]),
      "da-huy": await place("cod", ["cancel"]),
      "cho-hoan-tien": await place("bank", ["mark_paid", "cancel"]),
    } as const;

    const counts = await orders.countOrderStages();
    for (const [stage, id] of Object.entries(expected) as [keyof typeof expected, string][]) {
      const order = (await orders.findOrderById(id))!;
      expect(orderStage(order), stage).toBe(stage);
      expect(counts[stage], stage).toBe(1);
      const listed = await orders.listOrders({ stage });
      expect(listed.items.map((o) => o.id)).toEqual([id]);
    }

    // Danh sách ưu tiên: các đơn cần xử lý ngay đứng trước mọi đơn khác, theo đúng thứ tự trong bảng.
    const all = (await orders.listOrders({ sort: "priority", pageSize: 50 })).items.map((o) => orderStage(o));
    expect(all).toEqual(ORDER_STAGE_KEYS.filter((key) => key in expected));
    const firstOther = all.findIndex((key) => !ACTION_STAGES.includes(key));
    expect(all.slice(firstOther).some((key) => ACTION_STAGES.includes(key))).toBe(false);

    const pulse = await orders.orderPulse();
    expect(pulse.needsAction).toBe(ACTION_STAGES.length);
    expect(pulse.latest?.id).toBe(expected["cho-hoan-tien"]);
  });

  it("thanh tiến trình", () => {
    expect(orderProgress({ status: "pending", shippingStatus: "not_created" })).toEqual({ done: 1, problem: null });
    expect(orderProgress({ status: "processing", shippingStatus: "ready" })).toEqual({ done: 3, problem: null });
    expect(orderProgress({ status: "processing", shippingStatus: "failed" })).toEqual({ done: 4, problem: 4 });
    expect(orderProgress({ status: "cancelled", shippingStatus: "not_created" })).toEqual({ done: 1, problem: 1 });
    expect(orderProgress({ status: "completed", shippingStatus: "delivered" })).toEqual({ done: 6, problem: null });
  });
});
