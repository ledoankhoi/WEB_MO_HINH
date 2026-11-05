import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { suggestTerms } from "@/lib/search-suggest";
import { TRANSFORMABLE_MODEL_KEYS, modelKey, transformLabel } from "@/lib/model-features";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const products = await import("@/server/repo/products");
const users = await import("@/server/repo/users");
const alerts = await import("@/server/repo/stock-alerts");

const entry = { actor: { id: null, role: "support" as const }, action: "stock_alert.notify", entity: "stock_alerts", summary: "test" };

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("gợi ý ô tìm kiếm", () => {
  const names = ["Optimus Prime G1 Masterpiece", "Optimus Prime Rise of the Beasts Voyager", "Optimus Prime G1 Commander Class", "Bumblebee Studio Series Deluxe"];

  it("nối thêm từ sau chỗ khớp, cụm có trong nhiều tên hơn đứng trước", () => {
    expect(suggestTerms("optimus", names)).toEqual(["optimus prime", "optimus prime g1", "optimus prime rise"]);
  });

  it("từ cuối đang gõ dở vẫn khớp, không phân biệt dấu và hoa thường", () => {
    expect(suggestTerms("OPTI", names)[0]).toBe("optimus");
    expect(suggestTerms("bộ pháo", ["Bộ pháo tay Bumblebee"])).toEqual(["bộ pháo tay", "bộ pháo tay bumblebee"]);
    expect(suggestTerms("bo phao", ["Bộ pháo tay Bumblebee"])).toEqual(["bộ pháo tay", "bộ pháo tay bumblebee"]);
  });

  it("không gợi ý lại đúng từ đã gõ; không khớp thì rỗng", () => {
    expect(suggestTerms("optimus prime", ["Optimus Prime"])).toEqual([]);
    expect(suggestTerms("gundam", names)).toEqual([]);
    expect(suggestTerms("   ", names)).toEqual([]);
  });
});

describe("lọc mô hình biến hình 3D", () => {
  it("chỉ trả sản phẩm có clip biến hình hoặc hợp thể, nhãn đúng loại", async () => {
    const { items, total } = await products.queryProducts({ transformable: true, pageSize: 100 });
    expect(total).toBeGreaterThan(0);
    for (const item of items) {
      expect(TRANSFORMABLE_MODEL_KEYS).toContain(modelKey(item.modelUrl));
      expect(transformLabel(item.modelUrl)).not.toBeNull();
    }
    const bruticus = items.find((item) => item.slug === "bruticus");
    expect(bruticus && transformLabel(bruticus.modelUrl)).toBe("Hợp thể 3D");
    expect(transformLabel(items.find((item) => item.slug === "alliance-optimus-prime")?.modelUrl)).toBe("Biến hình 3D");
    // Sản phẩm không có clip (Gundam) không lọt vào.
    expect(items.some((item) => item.slug === "rx-78-2-gundam")).toBe(false);
  });
});

describe("menu danh mục mở rộng", () => {
  it("mỗi danh mục có series, thương hiệu xếp theo số sản phẩm, số mẫu biến hình và một sản phẩm nổi bật", async () => {
    const data = await products.listCategoryMenuData();
    const transformers = data.transformers;
    expect(transformers.featured?.category).toBe("transformers");
    expect(transformers.transformable).toBeGreaterThan(0);
    for (const list of [transformers.series, transformers.brands]) {
      expect(list.every((item, index) => index === 0 || list[index - 1].count >= item.count)).toBe(true);
    }
    expect(data["model-kits"].transformable).toBe(0);
    expect(data["robot-hop-the"].featured?.slug).toBe("bruticus");
  });
});

describe("báo khi có hàng", () => {
  let variantId: string;
  let userId: string;

  beforeAll(async () => {
    const db = await getDb();
    const rows = (await db.execute("SELECT variant_id FROM product_list WHERE is_active ORDER BY slug LIMIT 1")).rows;
    variantId = String(rows[0].variant_id);
    userId = await users.insertUser({ email: "cho@example.com", name: "Người Chờ", phone: "", passwordHash: "x" });
  });

  it("ghi nhận một lần cho mỗi liên hệ và phiên bản; phiên bản không bán thì từ chối", async () => {
    const email = { contact: "cho@example.com", kind: "email" as const };
    expect(await alerts.createStockAlert({ variantId, contact: email, userId })).toBe("created");
    expect(await alerts.createStockAlert({ variantId, contact: email, userId })).toBe("duplicate");
    expect(await alerts.createStockAlert({ variantId, contact: { contact: "0901234567", kind: "phone" }, userId: null })).toBe("created");
    expect(await alerts.createStockAlert({ variantId: "khongco", contact: email, userId })).toBe("not_found");

    const { items, total } = await alerts.listStockAlerts({ status: "pending", page: 1, pageSize: 10 });
    expect(total).toBe(2);
    expect(items.map((item) => item.contact).sort()).toEqual(["0901234567", "cho@example.com"]);
    expect(items.find((item) => item.contact === "cho@example.com")).toMatchObject({ userName: "Người Chờ", contactKind: "email" });
  });

  it("đánh dấu đã báo ghi nhật ký từng dòng; báo xong thì đăng ký lại được", async () => {
    const pending = (await alerts.listStockAlerts({ status: "pending", page: 1, pageSize: 10 })).items;
    const ids = pending.map((item) => item.id);
    expect(await alerts.markStockAlertsNotified(ids, entry)).toBe(2);
    expect(await alerts.markStockAlertsNotified(ids, entry)).toBe(0);

    const db = await getDb();
    const logs = await db.execute("SELECT entity_id FROM audit_logs WHERE action = 'stock_alert.notify'");
    expect(logs.rows.map((row) => String(row.entity_id)).sort()).toEqual([...ids].sort());

    expect((await alerts.listStockAlerts({ status: "pending", page: 1, pageSize: 10 })).total).toBe(0);
    expect((await alerts.listStockAlerts({ status: "notified", page: 1, pageSize: 10 })).items.every((item) => item.notifiedAt !== null)).toBe(true);
    expect(await alerts.createStockAlert({ variantId, contact: { contact: "cho@example.com", kind: "email" }, userId })).toBe("created");
  });

  it("giới hạn số yêu cầu đang chờ của một liên hệ", async () => {
    const db = await getDb();
    const variants = (await db.execute("SELECT variant_id FROM product_list WHERE is_active ORDER BY slug")).rows.map((row) => String(row.variant_id));
    const max = alerts.MAX_PENDING_ALERTS_PER_CONTACT;
    expect(variants.length).toBeGreaterThan(max);
    const contact = { contact: "nhieu@example.com", kind: "email" as const };
    for (const id of variants.slice(0, max)) expect(await alerts.createStockAlert({ variantId: id, contact, userId: null })).toBe("created");
    expect(await alerts.createStockAlert({ variantId: variants[max], contact, userId: null })).toBe("limit");
  });
});
