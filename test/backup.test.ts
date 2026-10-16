import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { dumpDatabase, readBackup, restoreDatabase, writeBackup } from "../scripts/backup-lib.mjs";
import { setupTempDatabase } from "./helpers/temp-db";

const source = setupTempDatabase();
const { getDb } = await import("@/server/db");
const orders = await import("@/server/repo/orders");
const inventory = await import("@/server/repo/inventory");

const dir = await mkdtemp(path.join(tmpdir(), "robotica-backup-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("sao lưu và khôi phục (T24, OPS-01)", () => {
  it("sao lưu ra JSON, khôi phục vào CSDL trống thì khớp từng dòng và đối soát kho không lệch", async () => {
    // Dựng dữ liệu: dữ liệu mẫu (có ảnh bytea, cột identity) và một đơn hàng giữ hàng.
    const db = await getDb();
    const row = (await db.execute("SELECT variant_id, price FROM product_list WHERE stock >= 1 ORDER BY slug LIMIT 1")).rows[0];
    const created = await orders.createOrder({
      userId: null,
      paymentMethod: "cod",
      customerName: "Khách",
      customerPhone: "0901234567",
      customerEmail: "",
      shippingAddress: "12 Lê Lợi",
      shippingCity: "Đà Nẵng",
      note: "",
      idempotencyKey: null,
      items: [{ variantId: String(row.variant_id), quantity: 1, expectedPrice: Number(row.price) }],
    });
    expect(created.ok).toBe(true);
    await source.pg.query("INSERT INTO product_images (product_id, data, content_type, updated_at) SELECT id, '\\x00ff10'::bytea, 'image/png', 1 FROM products ORDER BY slug LIMIT 1 ON CONFLICT DO NOTHING");

    const original = await dumpDatabase((text: string, values?: unknown[]) => source.pg.query(text, values));
    expect(original.tables.orders).toHaveLength(1);
    expect(original.tables.stock_movements.length).toBeGreaterThan(0);
    await writeBackup(dir, original);
    await source();

    // CSDL đích: chạy migration (kèm dữ liệu mẫu), rồi khôi phục đè lên.
    const target = setupTempDatabase();
    await getDb();
    const restored = await readBackup(dir);
    await target.pg.transaction((tx) => restoreDatabase((text: string, values?: unknown[]) => tx.query(text, values), restored));

    const again = await dumpDatabase((text: string, values?: unknown[]) => target.pg.query(text, values));
    expect(again).toEqual(original);
    expect(await inventory.findInventoryDiscrepancies()).toEqual([]);

    // Bộ đếm identity được đặt lại: ghi thêm không đụng khoá đã có.
    await expect(target.pg.query("INSERT INTO order_events (order_id, field, from_value, to_value, note, created_at) SELECT id, 'status', 'pending', 'pending', 'test', 1 FROM orders")).resolves.toBeTruthy();
    await target();
  });
});
