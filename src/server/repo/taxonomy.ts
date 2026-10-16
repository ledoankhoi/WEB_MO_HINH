import "server-only";
import { getDb, isConstraintError, type InStatement } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";

// Danh mục (2 cấp), thương hiệu, series. Thương hiệu và series chỉ có tên, slug.
export const TAXONOMY_KINDS = ["categories", "brands", "series"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];
export const isTaxonomyKind = (value: unknown): value is TaxonomyKind => TAXONOMY_KINDS.includes(value as TaxonomyKind);

export type TaxonomyItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
};

export type TaxonomyInput = { slug: string; name: string; description: string; parentId: string | null; sortOrder: number };

// Sản phẩm thuộc từng mục (khoá ngoại). Slug danh mục còn sản phẩm vẫn không đổi được vì cửa hàng lọc theo
// slug cố định trong CATEGORIES (src/lib/catalog.ts).
const PRODUCTS_OF = {
  categories: "SELECT 1 FROM products p WHERE p.category_id = t.id",
  brands: "SELECT 1 FROM products p WHERE p.brand_id = t.id",
  series: "SELECT 1 FROM products p WHERE p.series_id = t.id",
};

// Danh mục: gốc theo thứ tự, mỗi gốc kèm ngay các con. Thương hiệu, series: theo tên.
export async function listTaxonomy(kind: TaxonomyKind): Promise<TaxonomyItem[]> {
  const db = await getDb();
  const count = `(SELECT COUNT(*) FROM (${PRODUCTS_OF[kind]}) x)`;
  const extra = kind === "categories" ? "t.description, t.parent_id, t.sort_order" : "'' AS description, NULL AS parent_id, 0 AS sort_order";
  const result = await db.execute(`SELECT t.id, t.slug, t.name, ${extra}, ${count} AS product_count FROM ${kind} t ORDER BY sort_order, name`);
  const items = result.rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    description: String(row.description),
    parentId: row.parent_id === null ? null : String(row.parent_id),
    sortOrder: Number(row.sort_order),
    productCount: Number(row.product_count),
  }));
  return items.filter((item) => !item.parentId).flatMap((root) => [root, ...items.filter((item) => item.parentId === root.id)]);
}

// Tạo (`id` null) hoặc sửa. Danh mục cha phải là danh mục gốc, danh mục đang có con không có cha được, và
// slug danh mục không đổi được khi còn sản phẩm (sản phẩm cũ trỏ tới slug). Trả về id, hoặc null khi điều kiện
// sai hay dòng không còn. Slug trùng thì ném lỗi ràng buộc (xem isConstraintError).
export async function saveTaxonomy(
  kind: TaxonomyKind,
  id: string | null,
  input: TaxonomyInput,
  entry: Omit<AuditEntry, "entityId">,
): Promise<string | null> {
  const targetId = id ?? newId();
  let statement: { sql: string; args: (string | number | null)[] };
  if (kind !== "categories") {
    statement = id
      ? { sql: `UPDATE ${kind} SET slug = ?, name = ? WHERE id = ?`, args: [input.slug, input.name, id] }
      : { sql: `INSERT INTO ${kind} (id, slug, name) VALUES (?, ?, ?)`, args: [targetId, input.slug, input.name] };
  } else {
    const parentOk = "(?::text IS NULL OR EXISTS (SELECT 1 FROM categories p WHERE p.id = ? AND p.parent_id IS NULL AND p.id <> ?))";
    const parentArgs = [input.parentId, input.parentId, targetId];
    statement = id
      ? {
          sql: `UPDATE categories t SET slug = ?, name = ?, description = ?, parent_id = ?, sort_order = ?
                WHERE t.id = ? AND ${parentOk}
                  AND (?::text IS NULL OR NOT EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = t.id))
                  AND (t.slug = ? OR NOT EXISTS (${PRODUCTS_OF.categories}))`,
          args: [input.slug, input.name, input.description, input.parentId, input.sortOrder, id, ...parentArgs, input.parentId, input.slug],
        }
      : {
          sql: `INSERT INTO categories (id, slug, name, description, parent_id, sort_order)
                SELECT ?, ?, ?, ?, ?::text, ?::integer WHERE ${parentOk}`,
          args: [targetId, input.slug, input.name, input.description, input.parentId, input.sortOrder, ...parentArgs],
        };
  }
  const db = await getDb();
  const statements: InStatement[] = [withAudit(statement, entry)];
  // Khoá cả bảng danh mục: hai lần đổi cha chạy song song không tạo được cây 3 cấp.
  if (kind === "categories") statements.unshift("SELECT id FROM categories FOR UPDATE");
  const results = await db.batch(statements);
  return results[results.length - 1].rowsAffected > 0 ? targetId : null;
}

// Không xoá khi còn sản phẩm hoặc (với danh mục) còn danh mục con. Trả về false khi không xoá được.
export async function deleteTaxonomy(kind: TaxonomyKind, id: string, entry: Omit<AuditEntry, "entityId">): Promise<boolean> {
  const conditions = [
    `NOT EXISTS (${PRODUCTS_OF[kind]})`,
    kind === "categories" && "NOT EXISTS (SELECT 1 FROM categories c WHERE c.parent_id = t.id)",
  ].filter(Boolean);
  const db = await getDb();
  try {
    const result = await db.execute(
      withAudit({ sql: `DELETE FROM ${kind} t WHERE ${["t.id = ?", ...conditions].join(" AND ")}`, args: [id] }, entry),
    );
    return result.rowsAffected > 0;
  } catch (error) {
    // Lớp chặn cuối: khoá ngoại từ sản phẩm (từ T04).
    if (isConstraintError(error)) return false;
    throw error;
  }
}

// Lựa chọn danh mục, thương hiệu, series cho form sản phẩm.
export async function productFormOptions() {
  const [categories, brands, series] = await Promise.all([listTaxonomy("categories"), listTaxonomy("brands"), listTaxonomy("series")]);
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name, parentId: c.parentId })),
    brands: brands.map((b) => ({ id: b.id, name: b.name })),
    series: series.map((s) => ({ id: s.id, name: s.name })),
  };
}
