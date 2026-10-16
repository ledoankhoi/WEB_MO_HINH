import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser } = await import("./helpers/staff");
const reports = await import("@/server/repo/stock-reports");
const inventory = await import("@/server/repo/inventory");
const documents = await import("@/server/repo/stock-documents");
const orders = await import("@/server/repo/orders");
const products = await import("@/server/repo/products");
const warehouse = await import("@/server/repo/warehouse");

let entry: Parameters<typeof documents.postDocument>[1];
beforeAll(async () => {
  await getDb();
  const user = await createUser("warehouse_manager");
  entry = { actor: { id: user.id, role: "warehouse_manager" }, action: "test", entity: "stock_documents", summary: "test" };
});
afterAll(cleanup);

describe("danh sách tồn, thẻ kho, CSV", () => {
  it("SEC-03: không có cost.view thì dữ liệu trả về không có giá vốn", async () => {
    const without = await reports.listStock({ q: "RB-BRUTICUS", withCost: false });
    expect(without.items).toHaveLength(1);
    expect(without.items[0]).not.toHaveProperty("avgCost");
    expect(without.items[0]).not.toHaveProperty("value");
    const withCost = await reports.listStock({ q: "RB-BRUTICUS", withCost: true });
    expect(withCost.items[0]).toMatchObject({ onHand: 4, avgCost: 2214000, value: 4 * 2214000, ageDays: expect.any(Number) });
  });

  it("lọc sắp hết, hết hàng, có cách ly; thẻ kho có số dư sau từng dòng", async () => {
    const low = await reports.listStock({ filter: "low", withCost: false, pageSize: 200 });
    expect(low.items.every((i) => i.available >= 1 && i.available <= i.threshold)).toBe(true);
    const out = await reports.listStock({ filter: "out", withCost: false, pageSize: 200 });
    expect(out.items.every((i) => i.available <= 0)).toBe(true);
    // Cho một món nhập cách đây 100 ngày (theo giờ CSDL): chỉ món đó lọt bộ lọc tồn lâu.
    const bruticus = (await products.findProductBySlug("bruticus"))!;
    const db = await getDb();
    await db.execute({
      sql: "UPDATE inventory SET last_received_at = (extract(epoch FROM now()) * 1000)::bigint - 100::bigint * 86400000 WHERE variant_id = ?",
      args: [bruticus.variantId],
    });
    const aging = await reports.listStock({ filter: "aging", withCost: false, pageSize: 200 });
    expect(aging.items.map((i) => i.sku)).toEqual(["RB-BRUTICUS"]);
    expect(aging.items[0].ageDays).toBe(100);

    const card = await reports.stockCard(bruticus.variantId);
    expect(card).toMatchObject([{ type: "receive", qtyDelta: 4, balance: 4, documentCode: "PN-SEED" }]);
  });

  it("CSV: có BOM, đặt nháy khi cần, chặn công thức trong ô chữ nhưng giữ số âm", () => {
    const csv = reports.toCsv(["Tên", "SL"], [["Robot, \"bản\" đặc biệt", -2], ["=HYPERLINK(1)", 3], ["-x", null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Tên,SL\r\n"Robot, ""bản"" đặc biệt",-2\r\n\'=HYPERLINK(1),3\r\n\'-x,\r\n');
  });
});

// Bộ sinh số giả ngẫu nhiên có hạt giống cố định để lần chạy nào cũng như nhau.
function random(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

describe("WH-10: chuỗi thao tác ngẫu nhiên vẫn đối soát khớp", () => {
  it("nhập, đặt, huỷ, xử lý đơn, xuất, chuyển, hàng hoàn: sổ kho luôn bằng số dư", async () => {
    const rand = random(20261016);
    const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
    const variants = (await products.queryProducts({ pageSize: 10 })).items;
    const locations = await warehouse.listLocations();
    const a01 = locations.find((l) => l.code === "A-01")!.id;
    const quarantine = locations.find((l) => l.type === "quarantine")!.id;
    const open: string[] = [];
    const customer = { userId: null, paymentMethod: "cod" as const, customerName: "Khách", customerPhone: "0901234567", customerEmail: "", shippingAddress: "1 Lê Lợi", shippingCity: "Huế", note: "", idempotencyKey: null };

    const post = async (type: "receipt" | "issue" | "transfer", line: Parameters<typeof documents.saveDraft>[1]["lines"][number]) => {
      const id = await documents.createDocument(type, entry);
      await documents.saveDraft(id, { supplierId: null, orderId: null, reasonCode: type === "issue" ? "damaged" : "", reference: "", note: "", expectedAt: null, lines: [line] });
      return documents.postDocument(id, entry);
    };
    const line = (variantId: string, qty: number, extra = {}) => ({ variantId, locationId: a01, toLocationId: null, qtyExpected: null, qty, qtyQuarantined: null, systemQty: null, unitCost: 100000, note: "", ...extra });

    for (let step = 0; step < 80; step++) {
      const product = pick(variants);
      const action = Math.floor(rand() * 7);
      if (action === 0) await post("receipt", line(product.variantId, 1 + Math.floor(rand() * 3), { qtyQuarantined: rand() < 0.3 ? 1 : 0 }));
      else if (action === 1) {
        const fresh = (await products.findProductById(product.id))!;
        const created = await orders.createOrder({ ...customer, items: [{ variantId: product.variantId, quantity: 1, expectedPrice: fresh.price }] });
        if (created.ok) open.push(created.order.id);
      } else if (action === 2 && open.length > 0) await orders.applyOrderAction(open.splice(Math.floor(rand() * open.length), 1)[0], "cancel");
      else if (action === 3 && open.length > 0) {
        const id = pick(open);
        for (const key of ["confirm", "start_packing", "packed"] as const) await orders.applyOrderAction(id, key);
        await orders.applyOrderAction(id, "hand_over", undefined, { tracking: { carrier: "GHN", code: `GHN${step}` } });
        if (rand() < 0.5) await orders.applyOrderAction(id, "delivered");
        else {
          await orders.applyOrderAction(id, "delivery_failed");
          await orders.applyOrderAction(id, "receive_return");
        }
        open.splice(open.indexOf(id), 1);
      } else if (action === 4) await post("issue", line(product.variantId, 1));
      else if (action === 5) await post("transfer", line(product.variantId, 1, { toLocationId: quarantine }));
      else await post("transfer", { ...line(product.variantId, 1), locationId: quarantine, toLocationId: a01 });
      // Thao tác thất bại (thiếu hàng...) là bình thường; điều cần đúng là không bao giờ lệch.
    }
    expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
    const db = await getDb();
    expect(Number((await db.execute("SELECT COUNT(*) AS n FROM stock_movements")).rows[0].n)).toBeGreaterThan(60);
  });
});

describe("PERF-01: 1.000 biến thể", () => {
  it("danh sách tồn và danh sách sản phẩm trang đầu dưới 300 ms trên PGlite", async () => {
    const db = await getDb();
    await db.batch([
      `INSERT INTO products (id, slug, name, category_id, model, search_text, status, created_at, updated_at)
       SELECT 'perf' || lpad(g::text, 16, '0'), 'perf-' || g, 'Robot hiệu năng ' || g, (SELECT id FROM categories WHERE slug = 'figure'),
              'humanoid', 'robot hieu nang ' || g, 'published', 1000 + g, 1000 + g
       FROM generate_series(1, 1000) g`,
      `INSERT INTO product_variants (id, product_id, sku, name, price, color_primary, color_secondary, color_accent, is_default, created_at, updated_at)
       SELECT 'pv' || lpad(g::text, 18, '0'), 'perf' || lpad(g::text, 16, '0'), 'PERF-' || g, 'Bản thường', 100000 + g, '#111111', '#222222', '#333333', true, 0, 0
       FROM generate_series(1, 1000) g`,
    ]);
    const time = async (fn: () => Promise<unknown>) => {
      await fn();
      const started = performance.now();
      await fn();
      return performance.now() - started;
    };
    expect((await reports.listStock({ withCost: true, pageSize: 50 })).total).toBeGreaterThanOrEqual(1039);
    expect(await time(() => reports.listStock({ withCost: true, pageSize: 50 }))).toBeLessThan(300);
    expect(await time(() => reports.listStock({ q: "PERF-99", withCost: false }))).toBeLessThan(300);
    expect(await time(() => products.queryProducts({ pageSize: 12 }))).toBeLessThan(300);
  });
});
