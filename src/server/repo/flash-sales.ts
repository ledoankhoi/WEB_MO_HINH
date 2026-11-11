import "server-only";
import { parseFlash } from "@/lib/flash-sale";
import type { ProductSummary } from "@/lib/types";
import { getDb, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";
import { flashJson, summaryColumns, toSummary } from "./products";

// Flash sale (src/lib/flash-sale.ts, docs/ke-hoach/nghiep-vu-ban-hang.md mục 9): chương trình và các phiên bản trong đó.

const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
// Số đã bán bằng giá sale của một dòng chương trình (đơn chưa huỷ).
const SOLD = `(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id
               WHERE oi.flash_sale_id = fi.sale_id AND oi.variant_id = fi.variant_id AND o.status <> 'cancelled')::int`;

export type FlashSaleInput = { title: string; startsAt: number; endsAt: number; isActive: boolean };
export type FlashSale = FlashSaleInput & { id: string; itemCount: number; sold: number; createdAt: number };
export type FlashItem = {
  variantId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  basePrice: number;
  salePrice: number;
  qtyLimit: number;
  maxPerOrder: number | null;
  sold: number;
};

function toSale(row: Row): FlashSale {
  return {
    id: String(row.id),
    title: String(row.title),
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    isActive: Boolean(row.is_active),
    itemCount: Number(row.item_count ?? 0),
    sold: Number(row.sold ?? 0),
    createdAt: Number(row.created_at),
  };
}

const SALE_SELECT = `SELECT fs.*, (SELECT COUNT(*) FROM flash_sale_items fi WHERE fi.sale_id = fs.id)::int AS item_count,
                            (SELECT COALESCE(SUM(${SOLD}), 0) FROM flash_sale_items fi WHERE fi.sale_id = fs.id)::int AS sold
                     FROM flash_sales fs`;

export async function listFlashSales(): Promise<FlashSale[]> {
  const db = await getDb();
  const result = await db.execute(`${SALE_SELECT} ORDER BY fs.starts_at DESC, fs.id LIMIT 200`);
  return result.rows.map(toSale);
}

export async function findFlashSale(id: string): Promise<{ sale: FlashSale; items: FlashItem[] } | null> {
  const db = await getDb();
  const [sale, items] = await db.batch([
    { sql: `${SALE_SELECT} WHERE fs.id = ?`, args: [id] },
    {
      sql: `SELECT fi.*, ${SOLD} AS sold, v.name AS variant_name, v.sku, v.price AS base_price, p.name AS product_name, p.slug AS product_slug
            FROM flash_sale_items fi JOIN product_variants v ON v.id = fi.variant_id JOIN products p ON p.id = v.product_id
            WHERE fi.sale_id = ? ORDER BY p.name, v.sku`,
      args: [id],
    },
  ]);
  if (!sale.rows[0]) return null;
  return {
    sale: toSale(sale.rows[0]),
    items: items.rows.map((row) => ({
      variantId: String(row.variant_id),
      productName: String(row.product_name),
      productSlug: String(row.product_slug),
      variantName: String(row.variant_name),
      sku: String(row.sku),
      basePrice: Number(row.base_price),
      salePrice: Number(row.sale_price),
      qtyLimit: Number(row.qty_limit),
      maxPerOrder: row.max_per_order === null ? null : Number(row.max_per_order),
      sold: Number(row.sold),
    })),
  };
}

// Phiên bản `variantId` đã nằm trong một chương trình khác (đang bật) có khung giờ chồng lên [startsAt, endsAt) chưa.
const OVERLAP = `EXISTS (SELECT 1 FROM flash_sale_items x JOIN flash_sales xs ON xs.id = x.sale_id
                         WHERE x.variant_id = fi_variant AND xs.id <> fi_sale AND xs.is_active AND xs.starts_at < fi_end AND xs.ends_at > fi_start)`;
const overlapSql = (variant: string, sale: string, start: string, end: string) =>
  OVERLAP.replace("fi_variant", variant).replace("fi_sale", sale).replace("fi_end", end).replace("fi_start", start);

export type SaveSaleResult = { ok: true; id: string } | { ok: false; reason: "not_found" | "overlap" };

// Tạo hoặc sửa chương trình. Đổi khung giờ (hoặc bật lại) mà làm một phiên bản trong đó chồng giờ với chương trình khác thì
// từ chối: mỗi phiên bản tại một thời điểm chỉ có một giá sale.
export async function saveFlashSale(id: string | null, input: FlashSaleInput, audit: AuditEntry): Promise<SaveSaleResult> {
  const db = await getDb();
  const now = Date.now();
  if (!id) {
    const newSaleId = newId();
    await db.execute(
      withAudit(
        {
          sql: `INSERT INTO flash_sales (id, title, starts_at, ends_at, is_active, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [newSaleId, input.title, input.startsAt, input.endsAt, input.isActive, audit.actor.id, now, now],
        },
        { ...audit, entityId: newSaleId },
      ),
    );
    return { ok: true, id: newSaleId };
  }
  if (input.isActive) {
    const clash = await db.execute({
      sql: `SELECT 1 FROM flash_sale_items fi WHERE fi.sale_id = ? AND ${overlapSql("fi.variant_id", "fi.sale_id", "?::bigint", "?::bigint")} LIMIT 1`,
      args: [id, input.endsAt, input.startsAt],
    });
    if (clash.rows.length > 0) return { ok: false, reason: "overlap" };
  }
  const result = await db.execute(
    withAudit(
      { sql: "UPDATE flash_sales SET title = ?, starts_at = ?, ends_at = ?, is_active = ?, updated_at = ? WHERE id = ?", args: [input.title, input.startsAt, input.endsAt, input.isActive, now, id] },
      audit,
    ),
  );
  return result.rowsAffected > 0 ? { ok: true, id } : { ok: false, reason: "not_found" };
}

export type ItemInput = { variantId: string; salePrice: number; qtyLimit: number; maxPerOrder: number | null };
export type SaveItemResult = "ok" | "not_found" | "price" | "overlap" | "below_sold";

// Thêm hoặc sửa một phiên bản trong chương trình. Giá sale phải thấp hơn giá thường; số suất không nhỏ hơn số đã bán.
export async function saveFlashItem(saleId: string, input: ItemInput, audit: AuditEntry): Promise<SaveItemResult> {
  const db = await getDb();
  const [sale, variant, sold] = await db.batch([
    { sql: "SELECT starts_at, ends_at, is_active FROM flash_sales WHERE id = ?", args: [saleId] },
    { sql: "SELECT v.price FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active", args: [input.variantId] },
    { sql: `SELECT ${SOLD} AS n FROM (SELECT ?::text AS sale_id, ?::text AS variant_id) fi`, args: [saleId, input.variantId] },
  ]);
  if (!sale.rows[0] || !variant.rows[0]) return "not_found";
  if (input.salePrice >= Number(variant.rows[0].price)) return "price";
  if (input.qtyLimit < Number(sold.rows[0].n)) return "below_sold";
  const window = sale.rows[0];
  if (window.is_active) {
    const clash = await db.execute({
      sql: `SELECT 1 WHERE ${overlapSql("?", "?", "?::bigint", "?::bigint")}`,
      args: [input.variantId, saleId, Number(window.ends_at), Number(window.starts_at)],
    });
    if (clash.rows.length > 0) return "overlap";
  }
  await db.batch([
    {
      sql: `INSERT INTO flash_sale_items (sale_id, variant_id, sale_price, qty_limit, max_per_order) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (sale_id, variant_id) DO UPDATE SET sale_price = EXCLUDED.sale_price, qty_limit = EXCLUDED.qty_limit,
              max_per_order = EXCLUDED.max_per_order`,
      args: [saleId, input.variantId, input.salePrice, input.qtyLimit, input.maxPerOrder],
    },
    { sql: "UPDATE flash_sales SET updated_at = ? WHERE id = ?", args: [Date.now(), saleId] },
    auditStatement({ ...audit, entityId: saleId, detail: { item: input } }),
  ]);
  return "ok";
}

// Bỏ một phiên bản khỏi chương trình. Đã có đơn mua bằng giá sale thì không bỏ được (giữ lịch sử); tắt chương trình thay vào.
export async function removeFlashItem(saleId: string, variantId: string, audit: AuditEntry): Promise<"ok" | "sold" | "not_found"> {
  const db = await getDb();
  const result = await db.execute({
    sql: `DELETE FROM flash_sale_items fi WHERE fi.sale_id = ? AND fi.variant_id = ?
            AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.flash_sale_id = fi.sale_id AND oi.variant_id = fi.variant_id)`,
    args: [saleId, variantId],
  });
  if (result.rowsAffected > 0) {
    await db.execute(auditStatement({ ...audit, entityId: saleId, detail: { removed: variantId } }));
    return "ok";
  }
  const exists = await db.execute({ sql: "SELECT 1 FROM flash_sale_items WHERE sale_id = ? AND variant_id = ?", args: [saleId, variantId] });
  return exists.rows.length > 0 ? "sold" : "not_found";
}

export type StorefrontSale = { id: string; title: string; startsAt: number; endsAt: number; products: ProductSummary[] };

// Khối flash sale ở trang chủ: chương trình đang bật chưa hết giờ (đang chạy hoặc sắp chạy), sớm nhất trước, kèm thẻ của
// từng phiên bản (giá thường của chính phiên bản đó, flash của chương trình này). Dùng trong dữ liệu được cache: mốc giờ lấy
// từ đồng hồ CSDL, trình duyệt tự ẩn chương trình đã hết giờ.
export async function listStorefrontSales(): Promise<StorefrontSale[]> {
  const db = await getDb();
  const [sales, items] = await db.batch([
    `SELECT id, title, starts_at, ends_at FROM flash_sales WHERE is_active AND ends_at > ${NOW} ORDER BY starts_at, id LIMIT 5`,
    `SELECT fi.sale_id, ${summaryColumns("p")}, v.id AS item_variant_id, v.price AS item_price, v.compare_at_price AS item_compare_at_price,
            ${flashJson("v.id")} AS item_flash
     FROM flash_sale_items fi
     JOIN flash_sales fs ON fs.id = fi.sale_id AND fs.is_active AND fs.ends_at > ${NOW}
     JOIN product_variants v ON v.id = fi.variant_id AND v.is_active
     JOIN product_list p ON p.id = v.product_id AND p.is_active
     ORDER BY fi.sale_price, p.name`,
  ]);
  return sales.rows.map((sale) => ({
    id: String(sale.id),
    title: String(sale.title),
    startsAt: Number(sale.starts_at),
    endsAt: Number(sale.ends_at),
    products: items.rows
      .filter((row) => row.sale_id === sale.id)
      .flatMap((row) => {
        const flash = parseFlash(row.item_flash);
        // Phiên bản chỉ hiện giá sale của chương trình sớm nhất của nó (flashJson); chương trình sau chưa tới lượt thì bỏ qua.
        if (!flash || flash.saleId !== sale.id) return [];
        const summary = toSummary(row);
        return [
          {
            ...summary,
            // Đợt đặt trước trong thẻ là của phiên bản mặc định: chỉ giữ khi dòng sale chính là phiên bản đó.
            preorder: row.item_variant_id === row.variant_id ? summary.preorder : null,
            variantId: String(row.item_variant_id),
            price: Number(row.item_price),
            compareAtPrice: row.item_compare_at_price === null ? null : Number(row.item_compare_at_price),
            flash,
          },
        ];
      }),
  }));
}
