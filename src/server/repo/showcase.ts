import "server-only";
import { TRANSFORMABLE_MODEL_URL_PATTERN } from "@/lib/model-features";
import type { ProductSummary } from "@/lib/types";
import { getDb } from "../db";
import { SUMMARY_COLUMNS, summaryColumns, toSummary } from "./products";

// Trưng bày (/trung-bay): bảng xếp hạng sản phẩm và con số tổng quan, tính từ dữ liệu sẵn có (đơn hàng, yêu thích, đánh
// giá, yêu cầu báo có hàng). Chỉ sản phẩm đang bán.

export const RANKINGS = [
  { slug: "ban-chay", label: "Bán chạy", unit: "đã bán", note: "Tổng số đã bán của các đơn đã xác nhận (không tính đơn huỷ)." },
  { slug: "yeu-thich", label: "Được yêu thích", unit: "lượt thích", note: "Số khách đã thêm vào danh sách yêu thích." },
  { slug: "danh-gia", label: "Đánh giá cao", unit: "điểm", note: "Điểm trung bình các đánh giá đã duyệt; bằng điểm thì nhiều đánh giá hơn đứng trước." },
  { slug: "cho-hang", label: "Được chờ nhiều", unit: "người chờ", note: "Số yêu cầu \"Báo khi có hàng\" đang chờ: mẫu khách đang săn." },
  { slug: "moi-ve", label: "Mới về kệ", unit: "", note: "Các mẫu mới lên kệ gần nhất." },
] as const;
export type RankingSlug = (typeof RANKINGS)[number]["slug"];

export function isRankingSlug(value: string): value is RankingSlug {
  return RANKINGS.some((ranking) => ranking.slug === value);
}

export type RankedProduct = { product: ProductSummary; value: number; count?: number };

// Câu SQL trả về product_id và giá trị xếp hạng (value, count tuỳ bảng), cao trước.
const METRICS: Record<Exclude<RankingSlug, "moi-ve">, string> = {
  "ban-chay": `SELECT i.product_id, SUM(i.quantity)::int AS value, NULL::int AS count
               FROM order_items i JOIN orders o ON o.id = i.order_id
               WHERE o.status IN ('confirmed', 'processing', 'completed')
               GROUP BY i.product_id`,
  "yeu-thich": "SELECT product_id, COUNT(*)::int AS value, NULL::int AS count FROM wishlist_items GROUP BY product_id",
  "danh-gia": `SELECT product_id, ROUND(AVG(rating)::numeric, 1)::float AS value, COUNT(*)::int AS count
               FROM reviews WHERE status = 'approved' GROUP BY product_id`,
  "cho-hang": `SELECT v.product_id, COUNT(*)::int AS value, NULL::int AS count
               FROM stock_alerts a JOIN product_variants v ON v.id = a.variant_id
               WHERE a.notified_at IS NULL GROUP BY v.product_id`,
};

export async function listRanking(slug: RankingSlug, limit: number): Promise<RankedProduct[]> {
  const db = await getDb();
  if (slug === "moi-ve") {
    const result = await db.execute({ sql: `SELECT ${SUMMARY_COLUMNS}, created_at FROM product_list WHERE is_active ORDER BY created_at DESC, id LIMIT ?`, args: [limit] });
    return result.rows.map((row) => ({ product: toSummary(row), value: Number(row.created_at) }));
  }
  const result = await db.execute({
    sql: `SELECT ${summaryColumns("p")}, m.value, m.count
          FROM (${METRICS[slug]}) m JOIN product_list p ON p.id = m.product_id
          WHERE p.is_active AND m.value > 0
          ORDER BY m.value DESC, m.count DESC NULLS LAST, p.created_at DESC, p.id
          LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((row) => ({ product: toSummary(row), value: Number(row.value), count: row.count === null ? undefined : Number(row.count) }));
}

export type ShowcaseStats = { products: number; transformable: number; sold: number; reviews: number; rating: number | null; collectors: number };

export async function getShowcaseStats(): Promise<ShowcaseStats> {
  const db = await getDb();
  const [products, sales, reviews] = await db.batch([
    {
      sql: "SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE model_url ~ ?)::int AS t FROM product_list WHERE is_active",
      args: [TRANSFORMABLE_MODEL_URL_PATTERN],
    },
    `SELECT COALESCE(SUM(i.quantity), 0)::int AS sold, COUNT(DISTINCT COALESCE(o.user_id, o.customer_phone))::int AS buyers
     FROM orders o LEFT JOIN order_items i ON i.order_id = o.id WHERE o.status IN ('confirmed', 'processing', 'completed')`,
    "SELECT COUNT(*)::int AS n, ROUND(AVG(rating)::numeric, 1)::float AS avg FROM reviews WHERE status = 'approved'",
  ]);
  return {
    products: Number(products.rows[0].n),
    transformable: Number(products.rows[0].t),
    sold: Number(sales.rows[0].sold),
    collectors: Number(sales.rows[0].buyers),
    reviews: Number(reviews.rows[0].n),
    rating: reviews.rows[0].avg === null ? null : Number(reviews.rows[0].avg),
  };
}
