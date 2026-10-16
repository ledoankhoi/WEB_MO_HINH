import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (cookie: string | { name: string }) => jar.delete(typeof cookie === "string" ? cookie : cookie.name),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const actions = await import("@/app/actions/inventory");
const documents = await import("@/server/repo/stock-documents");
const inventory = await import("@/server/repo/inventory");
const products = await import("@/server/repo/products");
const warehouse = await import("@/server/repo/warehouse");

let manager: { id: string };
let a01: string;
beforeAll(async () => {
  await getDb();
  manager = await createUser("warehouse_manager");
  await signInAs(manager.id);
  a01 = (await warehouse.listLocations()).find((l) => l.code === "A-01")!.id;
});
afterEach(async () => {
  expect(await inventory.findInventoryDiscrepancies()).toEqual([]);
});
afterAll(cleanup);

// Tạo phiếu nhập qua action (redirect ném lỗi mang id phiếu).
async function newReceipt(): Promise<string> {
  const error = await actions.createDocumentAction("receipt").catch((e: Error) => e);
  const match = /REDIRECT \/admin\/kho\/phieu\/([a-f0-9]{20})/.exec(String(error));
  if (!match) throw new Error(`không tạo được phiếu: ${String(error)}`);
  return match[1];
}

async function newProduct(sku: string) {
  const id = await products.insertProduct({
    slug: sku.toLowerCase(),
    name: `Sản phẩm ${sku}`,
    tagline: "",
    description: "",
    category: "figure",
    sku,
    price: 500_000,
    compareAtPrice: null,
    model: "humanoid",
    modelUrl: null,
    colors: { primary: "#111111", secondary: "#222222", accent: "#333333" },
    specs: [],
    isFeatured: false,
    status: "draft",
  });
  return (await products.findProductById(id))!.variantId;
}

async function balance(variantId: string) {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT on_hand, quarantined, avg_cost FROM inventory WHERE variant_id = ?", args: [variantId] })).rows[0];
  return row ? { onHand: Number(row.on_hand), quarantined: Number(row.quarantined), avgCost: Number(row.avg_cost) } : null;
}

const line = (variantId: string, values: Record<string, string | number>) => ({ variantId, locationId: a01, note: "", ...values });

describe("phiếu nhập mua (YC-KHO-03)", () => {
  it("WH-01: dự kiến 10, thực nhận 8: nháp chưa tác động tồn; ghi sổ +8 và phiếu ghi thiếu 2", async () => {
    const variantId = await newProduct("WH01");
    const id = await newReceipt();
    expect(await actions.saveDraftAction(id, { reference: "HD-001", lines: [line(variantId, { qtyExpected: 10, qty: 8, unitCost: 300000 })] })).toMatchObject({ ok: true });
    expect(await balance(variantId)).toBeNull();

    expect(await actions.documentAction(id, "post")).toMatchObject({ ok: true });
    expect(await balance(variantId)).toEqual({ onHand: 8, quarantined: 0, avgCost: 300000 });
    const doc = (await documents.findDocument(id))!;
    expect(doc).toMatchObject({ status: "posted", reference: "HD-001", code: expect.stringMatching(/^PN-\d{6}-[2-9A-Z]{4}$/) });
    expect(doc.lines).toMatchObject([{ qtyExpected: 10, qty: 8 }]);
    const db = await getDb();
    const moves = await db.execute({ sql: "SELECT type, qty_delta, actor_id FROM stock_movements WHERE document_id = ?", args: [id] });
    expect(moves.rows).toEqual([{ type: "receive", qty_delta: 8, actor_id: manager.id }]);
  });

  it("WH-02: ghi sổ cùng một phiếu hai lần (kể cả song song) chỉ ghi một bộ dòng sổ kho", async () => {
    const variantId = await newProduct("WH02");
    const id = await newReceipt();
    await actions.saveDraftAction(id, { lines: [line(variantId, { qty: 5, unitCost: 100000 })] });
    const results = await Promise.all([actions.documentAction(id, "post"), actions.documentAction(id, "post"), actions.documentAction(id, "post")]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await actions.documentAction(id, "post")).ok).toBeUndefined();
    expect((await balance(variantId))!.onHand).toBe(5);
  });

  it("WH-08: giá vốn bình quân gia quyền: tồn 2 giá 100.000, nhập 2 giá 200.000 thì giá vốn 150.000", async () => {
    const variantId = await newProduct("WH08");
    for (const unitCost of [100000, 200000]) {
      const id = await newReceipt();
      await actions.saveDraftAction(id, { lines: [line(variantId, { qty: 2, unitCost })] });
      expect((await actions.documentAction(id, "post")).ok).toBe(true);
    }
    const value = await balance(variantId);
    expect(value).toEqual({ onHand: 4, quarantined: 0, avgCost: 150000 });
    expect((value!.onHand + value!.quarantined) * value!.avgCost).toBe(600000);
  });

  it("phần cách ly vào khu cách ly, không cộng vào hàng bán được", async () => {
    const variantId = await newProduct("CL01");
    const id = await newReceipt();
    await actions.saveDraftAction(id, { lines: [line(variantId, { qty: 5, qtyQuarantined: 2, unitCost: 100000 })] });
    expect((await actions.documentAction(id, "post")).ok).toBe(true);
    expect(await balance(variantId)).toMatchObject({ onHand: 3, quarantined: 2 });
  });

  it("kiểm tra dữ liệu dòng: thiếu đơn giá, cách ly lớn hơn thực nhận, vị trí cách ly, trùng dòng, số âm", async () => {
    const variantId = await newProduct("VAL1");
    const id = await newReceipt();
    const quarantine = (await warehouse.listLocations()).find((l) => l.type === "quarantine")!.id;
    const result = await actions.saveDraftAction(id, {
      lines: [
        line(variantId, { qty: 2 }),
        line(variantId, { qty: 1, qtyQuarantined: 3, unitCost: 1 }),
        { ...line(variantId, { qty: 1, unitCost: 1 }), locationId: quarantine },
        line(variantId, { qty: -1, unitCost: 1 }),
      ],
    });
    expect(result.message).toMatch(/Dòng 1: cần nhập đơn giá/);
    expect(result.message).toMatch(/Dòng 2: SL cách ly/);
    expect(result.message).toMatch(/Dòng 2: trùng/);
    expect(result.message).toMatch(/Dòng 3: hàng nhận tốt phải vào kệ/);
    expect(result.message).toMatch(/Dòng 4: SL thực nhận phải là số nguyên/);
    expect((await documents.findDocument(id))!.lines).toEqual([]);
  });

  it("QT-12: phiếu đã ghi sổ không sửa, không huỷ được; phiếu rỗng không gửi, không ghi sổ được", async () => {
    const variantId = await newProduct("QT12");
    const empty = await newReceipt();
    expect((await actions.documentAction(empty, "submit")).ok).toBeUndefined();
    expect((await actions.documentAction(empty, "post")).message).toMatch(/chưa có dòng/);

    const id = await newReceipt();
    await actions.saveDraftAction(id, { lines: [line(variantId, { qty: 1, unitCost: 1000 })] });
    expect((await actions.documentAction(id, "submit")).ok).toBe(true);
    expect((await actions.saveDraftAction(id, { lines: [] })).message).toMatch(/Chỉ sửa được phiếu nháp/);
    expect((await actions.documentAction(id, "return")).ok).toBe(true);
    expect((await actions.documentAction(id, "post")).ok).toBe(true);
    expect((await actions.saveDraftAction(id, { lines: [] })).message).toMatch(/Chỉ sửa được phiếu nháp/);
    expect((await actions.documentAction(id, "cancel")).ok).toBeUndefined();
    expect((await documents.findDocument(id))!.status).toBe("posted");
  });

  it("nhân viên kho lập và gửi được phiếu của mình, không ghi sổ được, không sửa phiếu của người khác", async () => {
    const variantId = await newProduct("NV01");
    const staff = await createUser("warehouse");
    await signInAs(staff.id);
    const id = await newReceipt();
    expect((await actions.saveDraftAction(id, { lines: [line(variantId, { qty: 1, unitCost: 1000 })] })).ok).toBe(true);
    expect((await actions.documentAction(id, "submit")).ok).toBe(true);
    expect(await actions.documentAction(id, "post")).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });

    const other = await createUser("warehouse");
    await signInAs(other.id);
    expect(await actions.saveDraftAction(id, { lines: [] })).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });
    expect(await actions.documentAction(id, "cancel")).toEqual({ message: "Bạn không có quyền thực hiện thao tác này." });

    await signInAs(manager.id);
    expect((await actions.documentAction(id, "post")).ok).toBe(true);
    const listed = await documents.listDocuments({ type: "receipt", status: "posted" });
    expect(listed.items.map((d) => d.id)).toContain(id);
  });
});
