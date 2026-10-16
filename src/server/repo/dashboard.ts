import "server-only";
import { getDb } from "../db";

// Trang tổng quan (YC-QTN-07). Mốc thời gian lấy từ đồng hồ CSDL, ngày tính theo giờ Việt Nam (UTC+7).
const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
const VN = 7 * 3600 * 1000;
const DAY = 86400 * 1000;
const TODAY = `((${NOW} + ${VN}) / ${DAY} * ${DAY} - ${VN})`;
// Q6: đơn chuyển khoản chờ thanh toán quá 48 giờ thì nhân viên xem để huỷ.
const OVERDUE_MS = 48 * 3600 * 1000;

export type StoreDashboard = {
  ordersToday: number;
  revenueToday: number;
  // Đơn 30 ngày gần nhất: tổng và số đã huỷ.
  orders30: number;
  cancelled30: number;
  bestSellers: { productId: string; name: string; quantity: number }[];
  // Sản phẩm nổi bật đang bán mà có thể bán ≤ ngưỡng sắp hết.
  featuredLowStock: { id: string; name: string; stock: number }[];
  overdueTransfers: number;
  refundPending: number;
};

export async function storeDashboard(): Promise<StoreDashboard> {
  const db = await getDb();
  const [today, recent, best, featured, overdue, refunds] = await db.batch([
    `SELECT COUNT(*) AS n, COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0) AS revenue FROM orders WHERE created_at >= ${TODAY}`,
    `SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled FROM orders WHERE created_at >= ${NOW} - 30 * ${DAY}::bigint`,
    `SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS quantity
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'cancelled' AND o.created_at >= ${NOW} - 30 * ${DAY}::bigint
     GROUP BY oi.product_id ORDER BY quantity DESC, name LIMIT 5`,
    `SELECT p.id, p.name, p.stock FROM product_list p LEFT JOIN inventory i ON i.variant_id = p.variant_id
     WHERE p.is_active AND p.is_featured AND p.stock <= COALESCE(i.low_stock_threshold, 3) ORDER BY p.stock, p.name LIMIT 10`,
    { sql: `SELECT COUNT(*) AS n FROM orders WHERE payment_method = 'bank' AND status = 'pending' AND payment_status = 'unpaid' AND created_at < ${NOW} - ?`, args: [OVERDUE_MS] },
    "SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND payment_status = 'paid'",
  ]);
  return {
    ordersToday: Number(today.rows[0].n),
    revenueToday: Number(today.rows[0].revenue),
    orders30: Number(recent.rows[0].n),
    cancelled30: Number(recent.rows[0].cancelled),
    bestSellers: best.rows.map((row) => ({ productId: String(row.product_id), name: String(row.name), quantity: Number(row.quantity) })),
    featuredLowStock: featured.rows.map((row) => ({ id: String(row.id), name: String(row.name), stock: Number(row.stock) })),
    overdueTransfers: Number(overdue.rows[0].n),
    refundPending: Number(refunds.rows[0].n),
  };
}

export type StockDashboard = { available: number; lowStockSkus: number; outOfStockSkus: number };

export async function stockDashboard(): Promise<StockDashboard> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT COALESCE(SUM(GREATEST(COALESCE(i.on_hand - i.reserved, 0), 0)), 0) AS available,
           COUNT(*) FILTER (WHERE COALESCE(i.on_hand - i.reserved, 0) BETWEEN 1 AND COALESCE(i.low_stock_threshold, 3)) AS low,
           COUNT(*) FILTER (WHERE COALESCE(i.on_hand - i.reserved, 0) <= 0) AS out_of_stock
    FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.is_active`);
  const row = result.rows[0];
  return { available: Number(row.available), lowStockSkus: Number(row.low), outOfStockSkus: Number(row.out_of_stock) };
}
