import "server-only";
import { isRobotModelKey, type ProductSpec, type RobotColors, type RobotModelKey, type SortValue } from "@/lib/catalog";
import { foldText } from "@/lib/format";
import type { CartProduct, Product, ProductStatus, ProductSummary, ProductVariant } from "@/lib/types";
import { getDb, type InValue, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";

// product_list (migration 005): sản phẩm ghép biến thể mặc định, cột giá, tồn, màu là của biến thể đó.
const SUMMARY_COLUMNS = "id, variant_id, slug, name, tagline, category, price, compare_at_price, stock, image, is_featured";

const ORDER_BY: Record<SortValue, string> = {
  "moi-nhat": "created_at DESC, id",
  "noi-bat": "is_featured DESC, created_at DESC, id",
  "gia-tang": "price ASC, created_at DESC, id",
  "gia-giam": "price DESC, created_at DESC, id",
  ten: "lower(name) ASC, id",
};

function parseSpecs(value: unknown): ProductSpec[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ProductSpec => typeof item?.label === "string" && typeof item?.value === "string")
      .map((item) => ({ label: item.label, value: item.value }));
  } catch {
    return [];
  }
}

const colorsOf = (row: Row) => ({
  primary: String(row.color_primary),
  secondary: String(row.color_secondary),
  accent: String(row.color_accent),
});

function toVariant(row: Row): ProductVariant {
  return {
    id: String(row.id),
    sku: String(row.sku),
    name: String(row.name),
    condition: row.condition === "used" ? "used" : "new",
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    colors: colorsOf(row),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
  };
}

function toProduct(row: Row, variants: ProductVariant[]): Product {
  const model = String(row.model);
  return {
    id: String(row.id),
    variantId: String(row.variant_id),
    slug: String(row.slug),
    name: String(row.name),
    tagline: String(row.tagline),
    description: String(row.description),
    category: String(row.category),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    model: isRobotModelKey(model) ? model : "humanoid",
    modelUrl: row.model_url === null ? null : String(row.model_url),
    colors: colorsOf(row),
    specs: parseSpecs(row.specs),
    image: row.image === null ? null : String(row.image),
    isFeatured: Boolean(row.is_featured),
    isActive: Boolean(row.is_active),
    status: String(row.status) as ProductStatus,
    variants,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toSummary(row: Row): ProductSummary {
  return {
    id: String(row.id),
    variantId: String(row.variant_id),
    slug: String(row.slug),
    name: String(row.name),
    tagline: String(row.tagline),
    category: String(row.category),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    image: row.image === null ? null : String(row.image),
    isFeatured: Boolean(row.is_featured),
  };
}

// Số có thể bán của biến thể (một kho, Q2).
const VARIANT_STOCK = "COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = v.id), 0)::int";

async function loadProduct(where: string, arg: string): Promise<Product | null> {
  const db = await getDb();
  const [product, variants] = await db.batch([
    { sql: `SELECT * FROM product_list WHERE ${where}`, args: [arg] },
    {
      sql: `SELECT v.*, ${VARIANT_STOCK} AS stock FROM product_variants v
            WHERE v.product_id = (SELECT id FROM products WHERE ${where}) ORDER BY v.sort_order, v.created_at, v.id`,
      args: [arg],
    },
  ]);
  return product.rows[0] ? toProduct(product.rows[0], variants.rows.map(toVariant)) : null;
}

export const findProductBySlug = (slug: string) => loadProduct("slug = ?", slug);
export const findProductById = (id: string) => loadProduct("id = ?", id);

// Giá và tồn kho hiện tại của các biến thể trong giỏ. Biến thể đã tắt hoặc sản phẩm chưa xuất bản vẫn được
// trả về với available = false để giao diện báo cho khách biết.
export async function findCartProducts(variantIds: readonly string[]): Promise<CartProduct[]> {
  const unique = [...new Set(variantIds)];
  if (unique.length === 0) return [];
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT v.id, v.product_id, p.slug, v.price, v.compare_at_price, COALESCE(v.image, p.image) AS image,
                 p.name || CASE WHEN v.is_default THEN '' ELSE ' (' || v.name || ')' END AS name,
                 v.is_active AND p.status = 'published' AS available, ${VARIANT_STOCK} AS stock
          FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE v.id IN (${unique.map(() => "?").join(", ")})`,
    args: unique,
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    slug: String(row.slug),
    name: String(row.name),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    image: row.image === null ? null : String(row.image),
    available: Boolean(row.available),
  }));
}

export type ProductQuery = {
  q?: string;
  category?: string;
  sort?: SortValue;
  page?: number;
  pageSize?: number;
  // Trang quản trị cần thấy cả sản phẩm đang ẩn.
  includeInactive?: boolean;
};

export async function queryProducts(query: ProductQuery): Promise<{ items: ProductSummary[]; total: number }> {
  const where: string[] = [];
  const args: InValue[] = [];

  if (!query.includeInactive) where.push("is_active");
  if (query.category) {
    where.push("category = ?");
    args.push(query.category);
  }
  // Mỗi từ khoá phải xuất hiện trong search_text (đã bỏ dấu), nên "robot hinh nguoi" vẫn khớp "Robot hình người".
  for (const term of foldText(query.q ?? "").split(" ").filter(Boolean).slice(0, 6)) {
    where.push("search_text LIKE ? ESCAPE '\\'");
    args.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(query.pageSize ?? 12, 1), 100);
  const page = Math.max(query.page ?? 1, 1);

  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      { sql: `SELECT COUNT(*) AS total FROM product_list ${whereSql}`, args },
      {
        sql: `SELECT ${SUMMARY_COLUMNS} FROM product_list ${whereSql}
              ORDER BY ${ORDER_BY[query.sort ?? "moi-nhat"]} LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      },
    ]
  );
  return { items: rows.rows.map(toSummary), total: Number(count.rows[0].total) };
}

export async function listFeaturedProducts(limit: number): Promise<ProductSummary[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM product_list WHERE is_active
          ORDER BY is_featured DESC, created_at DESC, id LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(toSummary);
}

export async function listRelatedProducts(category: string, excludeId: string, limit: number): Promise<ProductSummary[]> {
  const db = await getDb();
  // Ưu tiên cùng danh mục, thiếu thì lấy thêm sản phẩm khác cho đủ hàng.
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM product_list WHERE is_active AND id <> ?
          ORDER BY (category = ?) DESC, is_featured DESC, created_at DESC, id LIMIT ?`,
    args: [excludeId, category, limit],
  });
  return result.rows.map(toSummary);
}

export async function listActiveSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  const db = await getDb();
  const result = await db.execute("SELECT slug, updated_at FROM product_list WHERE is_active ORDER BY created_at DESC, id");
  return result.rows.map((row) => ({ slug: String(row.slug), updatedAt: Number(row.updated_at) }));
}

export async function countProductsByCategory(): Promise<Record<string, number>> {
  const db = await getDb();
  const result = await db.execute("SELECT category, COUNT(*) AS total FROM product_list WHERE is_active GROUP BY category");
  return Object.fromEntries(result.rows.map((row) => [String(row.category), Number(row.total)]));
}

// Danh sách cho trang quản trị (cả bản nháp, đã lưu trữ), không kèm danh sách biến thể.
export async function listAllProducts(): Promise<Product[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM product_list ORDER BY created_at DESC, id");
  return result.rows.map((row) => toProduct(row, []));
}

// Thông tin chung của sản phẩm và biến thể mặc định. Tồn kho không sửa ở đây mà qua phiếu kho (QT-11).
export type ProductInput = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  model: RobotModelKey;
  modelUrl: string | null;
  colors: RobotColors;
  specs: ProductSpec[];
  isFeatured: boolean;
  status: ProductStatus;
};

const CATEGORY_ID = "(SELECT id FROM categories WHERE slug = ?)";

function productArgs(input: ProductInput): InValue[] {
  return [
    input.slug,
    input.name,
    input.tagline,
    input.description,
    input.category,
    input.model,
    input.modelUrl,
    JSON.stringify(input.specs),
    foldText(`${input.name} ${input.tagline} ${input.description}`),
    input.isFeatured,
    input.status,
  ];
}

const variantArgs = (input: ProductInput): InValue[] => [
  input.price,
  input.compareAtPrice,
  input.colors.primary,
  input.colors.secondary,
  input.colors.accent,
];

// Ném lỗi ràng buộc (xem isConstraintError) nếu slug hoặc SKU đã tồn tại.
export async function insertProduct(input: ProductInput, audit?: AuditEntry): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.batch([
    {
      sql: `INSERT INTO products (
              slug, name, tagline, description, category_id, model, model_url, specs, search_text, is_featured, status,
              published_at, id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ${CATEGORY_ID}, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN ?::bigint END, ?, ?, ?)`,
      args: [...productArgs(input), input.status, now, id, now, now],
    },
    {
      sql: `INSERT INTO product_variants (
              price, compare_at_price, color_primary, color_secondary, color_accent,
              id, product_id, sku, name, is_default, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Bản thường', true, ?, ?)`,
      args: [...variantArgs(input), newId(), id, input.sku, now, now],
    },
    ...(audit ? [auditStatement({ ...audit, entityId: id })] : []),
  ]);
  return id;
}

// SKU không đổi ở đây: đã có sổ kho hoặc đơn hàng thì phải giữ nguyên (YC-SP-03).
export async function updateProduct(id: string, input: ProductInput, audit?: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const [result] = await db.batch([
    withAudit(
      {
        sql: `UPDATE products SET
                slug = ?, name = ?, tagline = ?, description = ?, category_id = ${CATEGORY_ID}, model = ?, model_url = ?,
                specs = ?, search_text = ?, is_featured = ?, status = ?,
                published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at = ?
              WHERE id = ?`,
        args: [...productArgs(input), input.status, now, now, id],
      },
      audit,
    ),
    {
      sql: `UPDATE product_variants SET price = ?, compare_at_price = ?, color_primary = ?, color_secondary = ?,
              color_accent = ?, updated_at = ?
            WHERE product_id = ? AND is_default`,
      args: [...variantArgs(input), now, id],
    },
  ]);
  return result.rowsAffected > 0;
}

// Biến thể đã có trong đơn hàng hoặc sổ kho thì không xoá (YC-SP-11): trả về false, hãy lưu trữ thay vì xoá.
export async function deleteProduct(id: string, audit?: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const unused = `NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = ?
                     AND (EXISTS (SELECT 1 FROM order_items WHERE variant_id = v.id)
                          OR EXISTS (SELECT 1 FROM stock_movements WHERE variant_id = v.id)))`;
  const results = await db.batch([
    { sql: `DELETE FROM product_media WHERE product_id = ? AND ${unused}`, args: [id, id] },
    { sql: `DELETE FROM inventory WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?) AND ${unused}`, args: [id, id] },
    { sql: `DELETE FROM product_variants WHERE product_id = ? AND ${unused}`, args: [id, id] },
    withAudit({ sql: `DELETE FROM products WHERE id = ? AND ${unused}`, args: [id, id] }, audit),
    {
      sql: "DELETE FROM product_images WHERE product_id = ? AND NOT EXISTS (SELECT 1 FROM products WHERE id = ?)",
      args: [id, id],
    },
  ]);
  return results[3].rowsAffected > 0;
}

// Lưu ảnh đại diện và trỏ products.image tới phiên bản mới. Thời điểm lưu nằm trong đường dẫn
// nên trình duyệt có thể cache ảnh vĩnh viễn.
export async function saveProductImage(id: string, data: ArrayBuffer, contentType: string): Promise<string> {
  const db = await getDb();
  const version = Date.now();
  const image = `/media/${id}-${version}`;
  await db.batch(
    [
      {
        sql: `INSERT INTO product_images (product_id, content_type, data, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT (product_id) DO UPDATE SET
                content_type = excluded.content_type, data = excluded.data, updated_at = excluded.updated_at`,
        args: [id, contentType, new Uint8Array(data), version],
      },
      { sql: "UPDATE products SET image = ?, updated_at = ? WHERE id = ?", args: [image, version, id] },
    ]
  );
  return image;
}

export async function findProductImage(id: string): Promise<{ data: Uint8Array<ArrayBuffer>; contentType: string } | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT content_type, data FROM product_images WHERE product_id = ?",
    args: [id],
  });
  const row = result.rows[0];
  if (!row || !(row.data instanceof Uint8Array)) return null;
  return { data: new Uint8Array(row.data), contentType: String(row.content_type) };
}
