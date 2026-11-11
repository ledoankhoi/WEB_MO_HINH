import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const orders = await import("@/server/repo/orders");
const { parseConfig, serializeConfig, groupsFor } = await import("@/lib/workshop");

const draft = (items: { variantId: string; quantity: number; expectedPrice: number; cfg?: string }[]) => ({
  userId: null,
  paymentMethod: "cod" as const,
  customerName: "Khách Xưởng",
  customerPhone: "0912345678",
  customerEmail: "",
  shippingAddress: "1 Lê Lợi",
  shippingCity: "Hà Nội",
  note: "",
  idempotencyKey: null,
  items,
});

let robot: { variantId: string; price: number; stock: number };
beforeAll(async () => {
  const db = await getDb();
  const row = (await db.execute("SELECT variant_id, price, stock FROM product_list WHERE is_active AND category = 'transformers' AND stock >= 3 ORDER BY price LIMIT 1")).rows[0];
  robot = { variantId: String(row.variant_id), price: Number(row.price), stock: Number(row.stock) };
});
afterAll(cleanup);

describe("xưởng: cấu hình và giá (src/lib/workshop.ts)", () => {
  it("tính tổng giá, ngày xử lý; chọn rồi đọc lại ra đúng cấu hình", () => {
    const cfg = serializeConfig({ paint: "do-tham", finish: "bong", stand: "luc-giac-led", decal: "ten-rieng", decalText: "MINH 01", gift: "hop-qua" });
    expect(cfg).toBe("paint:do-tham.finish:bong.stand:luc-giac-led.decal:ten-rieng.gift:hop-qua.text:MINH_01");
    const parsed = parseConfig(cfg, "transformers")!;
    expect(parsed.price).toBe(350_000 + 80_000 + 250_000 + 60_000 + 40_000);
    expect(parsed.leadDays).toBe(7 + 2);
    expect(parsed.tint).toBe("#d23a32");
    expect(parsed.summary).toContain('In decal tên riêng "MINH 01"');
    expect(parseConfig("", "transformers")).toMatchObject({ price: 0, lines: [] });
  });

  it("từ chối cấu hình không hợp lệ: nhóm không áp dụng cho danh mục, lựa chọn không có, hoàn thiện không kèm sơn, decal thiếu chữ", () => {
    expect(parseConfig("assembly:lap-rap", "transformers")).toBeNull();
    expect(parseConfig("assembly:lap-rap", "model-kits")?.price).toBe(300_000);
    expect(parseConfig("paint:mau-la", "transformers")).toBeNull();
    expect(parseConfig("finish:bong", "transformers")).toBeNull();
    expect(parseConfig("decal:ten-rieng", "transformers")).toBeNull();
    expect(parseConfig("decal:ten-rieng.text:<script>", "transformers")).toBeNull();
    expect(parseConfig("paint:do-tham.paint:bang-lam", "transformers")).toBeNull();
    expect(groupsFor("phu-kien")).toEqual([]);
    expect(parseConfig("gift:hop-qua", "phu-kien")).toBeNull();
  });
});

describe("xưởng: đặt hàng", () => {
  it("đơn giá = giá mô hình + tuỳ chọn do máy chủ tính; lưu mô tả tuỳ chọn; cùng mẫu khác cấu hình là hai dòng", async () => {
    const cfg = "paint:bang-lam.stand:luc-giac";
    const extra = 350_000 + 90_000;
    const result = await orders.createOrder(
      draft([
        { variantId: robot.variantId, quantity: 1, expectedPrice: robot.price + extra, cfg },
        { variantId: robot.variantId, quantity: 1, expectedPrice: robot.price },
      ]),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    const order = await orders.findOrderByToken(result.order.token);
    const items = order!.items.toSorted((a, b) => b.unitPrice - a.unitPrice);
    expect(items.map((item) => [item.unitPrice, item.optionsPrice])).toEqual([
      [robot.price + extra, extra],
      [robot.price, 0],
    ]);
    expect(items[0].options).toBe("Dịch vụ sơn lại: Băng lam; Đế trưng bày: Đế lục giác");
    expect(order!.subtotal).toBe(2 * robot.price + extra);
  });

  it("giá trình duyệt gửi sai (không gồm tuỳ chọn) hoặc cấu hình giả thì báo giỏ đã đổi, không tạo đơn", async () => {
    const cheat = await orders.createOrder(draft([{ variantId: robot.variantId, quantity: 1, expectedPrice: robot.price, cfg: "paint:vang-solar" }]));
    expect(cheat).toMatchObject({ ok: false, reason: "cart_changed", issues: [expect.objectContaining({ reason: "price_changed" })] });
    const fake = await orders.createOrder(draft([{ variantId: robot.variantId, quantity: 1, expectedPrice: robot.price, cfg: "paint:mien-phi" }]));
    expect(fake).toMatchObject({ ok: false, reason: "cart_changed", issues: [expect.objectContaining({ reason: "unavailable" })] });
  });

  it("đơn có hai cấu hình cùng mẫu đi trọn quy trình xuất kho, và huỷ đơn khác trả đúng số giữ hàng", async () => {
    const db = await getDb();
    const reserved = async () =>
      Number((await db.execute({ sql: "SELECT COALESCE(SUM(reserved), 0)::int AS n FROM inventory WHERE variant_id = ?", args: [robot.variantId] })).rows[0].n);
    const before = await reserved();
    const place = () =>
      orders.createOrder(
        draft([
          { variantId: robot.variantId, quantity: 1, expectedPrice: robot.price + 40_000, cfg: "gift:hop-qua" },
          { variantId: robot.variantId, quantity: 1, expectedPrice: robot.price },
        ]),
      );
    const shipped = await place();
    if (!shipped.ok) throw new Error(JSON.stringify(shipped));
    expect(await reserved()).toBe(before + 2);
    for (const key of ["confirm", "start_packing", "packed"] as const) expect(await orders.applyOrderAction(shipped.order.id, key)).toBe(true);
    expect(await orders.applyOrderAction(shipped.order.id, "hand_over", undefined, { tracking: { carrier: "GHN", code: "GHN123" } })).toBe(true);
    expect(await reserved()).toBe(before);

    const cancelled = await place();
    if (!cancelled.ok) throw new Error(JSON.stringify(cancelled));
    expect(await orders.applyOrderAction(cancelled.order.id, "customer_cancel")).toBe(true);
    expect(await reserved()).toBe(before);
  });

  it("tồn kho tính chung mọi cấu hình của cùng một mẫu", async () => {
    const db = await getDb();
    const stock = Number((await db.execute({ sql: "SELECT stock FROM product_list WHERE variant_id = ?", args: [robot.variantId] })).rows[0].stock);
    const half = Math.ceil((stock + 1) / 2);
    const result = await orders.createOrder(
      draft([
        { variantId: robot.variantId, quantity: half, expectedPrice: robot.price + 40_000, cfg: "gift:hop-qua" },
        { variantId: robot.variantId, quantity: half, expectedPrice: robot.price },
      ]),
    );
    expect(result).toMatchObject({ ok: false, reason: "cart_changed" });
  });
});
