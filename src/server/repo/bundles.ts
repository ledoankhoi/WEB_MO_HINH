import "server-only";
import { BUNDLE_MAX_PRODUCTS, BUNDLE_MIN_PRODUCTS, type BundleDeal } from "@/lib/bundles";
import type { ProductSummary } from "@/lib/types";
import { getDb, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, type AuditEntry } from "./audit";
import { summaryColumns, toSummary } from "./products";

// Combo giảm giá khi mua đủ bộ (src/lib/bundles.ts, nghiep-vu-ban-hang mục 12).

export type DealWithMembers = BundleDeal & { isActive: boolean; members: ProductSummary[] };

// Combo đang bật có chứa ít nhất một sản phẩm trong `productIds` (giỏ hàng, đặt hàng). Chỉ tính sản phẩm đang bán: combo có
// thành viên ngừng bán thì không đủ bộ được nữa nên bỏ qua.
export async function listActiveDeals(productIds: readonly string[]): Promise<BundleDeal[]> {
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return [];
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT d.id, d.name, d.percent, array_agg(i.product_id ORDER BY i.product_id) AS product_ids
          FROM bundle_deals d JOIN bundle_deal_items i ON i.deal_id = d.id
          WHERE d.is_active AND d.id IN (SELECT deal_id FROM bundle_deal_items WHERE product_id IN (${unique.map(() => "?").join(", ")}))
          GROUP BY d.id
          HAVING bool_and(EXISTS (SELECT 1 FROM products p WHERE p.id = i.product_id AND p.status = 'published'))`,
    args: unique,
  });
  return result.rows.map((row) => ({ id: String(row.id), name: String(row.name), percent: Number(row.percent), productIds: toIds(row.product_ids) }));
}

// array_agg trả mảng (pg) hoặc chuỗi "{a,b}" tuỳ trình điều khiển.
function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return String(value ?? "").replace(/^\{|\}$/g, "").split(",").filter(Boolean);
}

async function withMembers(rows: Row[], activeOnly: boolean): Promise<DealWithMembers[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((row) => String(row.id));
  const members = await db.execute({
    sql: `SELECT i.deal_id, ${summaryColumns("p")} FROM bundle_deal_items i JOIN product_list p ON p.id = i.product_id
          WHERE i.deal_id IN (${ids.map(() => "?").join(", ")})${activeOnly ? " AND p.is_active" : ""} ORDER BY p.price DESC, p.name`,
    args: ids,
  });
  return rows.map((row) => {
    const list = members.rows.filter((member) => member.deal_id === row.id).map(toSummary);
    return { id: String(row.id), name: String(row.name), percent: Number(row.percent), isActive: Boolean(row.is_active), productIds: list.map((p) => p.id), members: list };
  });
}

// Combo đang bật kèm thẻ của mọi thành viên, cho trang sản phẩm và gợi ý ở giỏ (chỉ combo đủ thành viên đang bán).
export async function listDealsForProducts(productIds: readonly string[]): Promise<DealWithMembers[]> {
  const deals = await listActiveDeals(productIds);
  if (deals.length === 0) return [];
  const db = await getDb();
  const rows = await db.execute({ sql: `SELECT * FROM bundle_deals WHERE id IN (${deals.map(() => "?").join(", ")})`, args: deals.map((d) => d.id) });
  return withMembers(rows.rows, true);
}

export async function listAllDeals(): Promise<DealWithMembers[]> {
  const db = await getDb();
  const rows = await db.execute("SELECT * FROM bundle_deals ORDER BY created_at DESC LIMIT 200");
  return withMembers(rows.rows, false);
}

export type DealInput = { name: string; percent: number; isActive: boolean; productIds: string[] };

// Tạo hoặc sửa combo (thay toàn bộ danh sách thành viên). Trả về id, hoặc null khi combo không còn, hoặc "products" khi có
// sản phẩm không tồn tại hay số thành viên ngoài giới hạn.
export async function saveDeal(id: string | null, input: DealInput, audit: AuditEntry): Promise<string | null | "products"> {
  const productIds = [...new Set(input.productIds)];
  if (productIds.length < BUNDLE_MIN_PRODUCTS || productIds.length > BUNDLE_MAX_PRODUCTS) return "products";
  const db = await getDb();
  const found = await db.execute({ sql: `SELECT COUNT(*)::int AS n FROM products WHERE id IN (${productIds.map(() => "?").join(", ")})`, args: productIds });
  if (Number(found.rows[0].n) !== productIds.length) return "products";
  const dealId = id ?? newId();
  const now = Date.now();
  const statements: InStatement[] = [
    id
      ? { sql: "UPDATE bundle_deals SET name = ?, percent = ?, is_active = ?, updated_at = ? WHERE id = ?", args: [input.name, input.percent, input.isActive, now, id] }
      : {
          sql: "INSERT INTO bundle_deals (id, name, percent, is_active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [dealId, input.name, input.percent, input.isActive, audit.actor.id, now, now],
        },
    { sql: "DELETE FROM bundle_deal_items WHERE deal_id = ? AND EXISTS (SELECT 1 FROM bundle_deals WHERE id = ?)", args: [dealId, dealId] },
    ...productIds.map((productId) => ({
      sql: "INSERT INTO bundle_deal_items (deal_id, product_id) SELECT id, ? FROM bundle_deals WHERE id = ?",
      args: [productId, dealId],
    })),
    auditStatement({ ...audit, entityId: dealId, detail: input }),
  ];
  const results = await db.batch(statements);
  return results[0].rowsAffected > 0 ? dealId : null;
}
