import "server-only";
import { isRobotModelKey, type ProductSpec, type RobotColors, type RobotModelKey, type SortValue } from "@/lib/catalog";
import { foldText } from "@/lib/format";
import type { CartProduct, Product, ProductSummary } from "@/lib/types";
import { getDb, type InValue, type Row } from "../db";
import { newId } from "../ids";

const SUMMARY_COLUMNS = "id, slug, name, tagline, category, price, compare_at_price, stock, image, is_featured";

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

function toProduct(row: Row): Product {
  const model = String(row.model);
  return {
    id: String(row.id),
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
    colors: {
      primary: String(row.color_primary),
      secondary: String(row.color_secondary),
      accent: String(row.color_accent),
    },
    specs: parseSpecs(row.specs),
    image: row.image === null ? null : String(row.image),
    isFeatured: Number(row.is_featured) === 1,
    isActive: Number(row.is_active) === 1,
    sold: Number(row.sold),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toSummary(row: Row): ProductSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    tagline: String(row.tagline),
    category: String(row.category),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    image: row.image === null ? null : String(row.image),
    isFeatured: Number(row.is_featured) === 1,
  };
}

export async function findProductBySlug(slug: string): Promise<Product | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT * FROM products WHERE slug = ?", args: [slug] });
  return result.rows[0] ? toProduct(result.rows[0]) : null;
}

export async function findProductById(id: string): Promise<Product | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT * FROM products WHERE id = ?", args: [id] });
  return result.rows[0] ? toProduct(result.rows[0]) : null;
}

// Giá và tồn kho hiện tại cho giỏ hàng. Sản phẩm đã ẩn vẫn được trả về với available = false
// để giao diện báo cho khách biết.
export async function findCartProducts(ids: readonly string[]): Promise<CartProduct[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT id, slug, name, price, compare_at_price, stock, image, is_active
          FROM products WHERE id IN (${unique.map(() => "?").join(", ")})`,
    args: unique,
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? null : Number(row.compare_at_price),
    stock: Number(row.stock),
    image: row.image === null ? null : String(row.image),
    available: Number(row.is_active) === 1,
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

  if (!query.includeInactive) where.push("is_active = 1");
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
      { sql: `SELECT COUNT(*) AS total FROM products ${whereSql}`, args },
      {
        sql: `SELECT ${SUMMARY_COLUMNS} FROM products ${whereSql}
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
    sql: `SELECT ${SUMMARY_COLUMNS} FROM products WHERE is_active = 1
          ORDER BY is_featured DESC, created_at DESC, id LIMIT ?`,
    args: [limit],
  });
  return result.rows.map(toSummary);
}

export async function listRelatedProducts(category: string, excludeId: string, limit: number): Promise<ProductSummary[]> {
  const db = await getDb();
  // Ưu tiên cùng danh mục, thiếu thì lấy thêm sản phẩm khác cho đủ hàng.
  const result = await db.execute({
    sql: `SELECT ${SUMMARY_COLUMNS} FROM products WHERE is_active = 1 AND id <> ?
          ORDER BY (category = ?) DESC, sold DESC, created_at DESC, id LIMIT ?`,
    args: [excludeId, category, limit],
  });
  return result.rows.map(toSummary);
}

export async function listActiveSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  const db = await getDb();
  const result = await db.execute("SELECT slug, updated_at FROM products WHERE is_active = 1 ORDER BY created_at DESC, id");
  return result.rows.map((row) => ({ slug: String(row.slug), updatedAt: Number(row.updated_at) }));
}

export async function countProductsByCategory(): Promise<Record<string, number>> {
  const db = await getDb();
  const result = await db.execute("SELECT category, COUNT(*) AS total FROM products WHERE is_active = 1 GROUP BY category");
  return Object.fromEntries(result.rows.map((row) => [String(row.category), Number(row.total)]));
}

export async function listAllProducts(): Promise<Product[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM products ORDER BY created_at DESC, id");
  return result.rows.map(toProduct);
}

export type ProductInput = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
  model: RobotModelKey;
  modelUrl: string | null;
  colors: RobotColors;
  specs: ProductSpec[];
  isFeatured: boolean;
  isActive: boolean;
};

function inputArgs(input: ProductInput): InValue[] {
  return [
    input.slug,
    input.name,
    input.tagline,
    input.description,
    input.category,
    input.price,
    input.compareAtPrice,
    input.stock,
    input.model,
    input.modelUrl,
    input.colors.primary,
    input.colors.secondary,
    input.colors.accent,
    JSON.stringify(input.specs),
    foldText(`${input.name} ${input.tagline} ${input.description}`),
    input.isFeatured ? 1 : 0,
    input.isActive ? 1 : 0,
  ];
}

// Ném lỗi ràng buộc (xem isConstraintError) nếu slug đã tồn tại.
export async function insertProduct(input: ProductInput): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO products (
            slug, name, tagline, description, category, price, compare_at_price, stock, model, model_url,
            color_primary, color_secondary, color_accent, specs, search_text, is_featured, is_active,
            id, sold, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [...inputArgs(input), id, now, now],
  });
  return id;
}

export async function updateProduct(id: string, input: ProductInput): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute({
    sql: `UPDATE products SET
            slug = ?, name = ?, tagline = ?, description = ?, category = ?, price = ?, compare_at_price = ?,
            stock = ?, model = ?, model_url = ?, color_primary = ?, color_secondary = ?, color_accent = ?,
            specs = ?, search_text = ?, is_featured = ?, is_active = ?, updated_at = ?
          WHERE id = ?`,
    args: [...inputArgs(input), Date.now(), id],
  });
  return result.rowsAffected > 0;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const db = await getDb();
  const [, removed] = await db.batch(
    [
      { sql: "DELETE FROM product_images WHERE product_id = ?", args: [id] },
      { sql: "DELETE FROM products WHERE id = ?", args: [id] },
    ]
  );
  return removed.rowsAffected > 0;
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
