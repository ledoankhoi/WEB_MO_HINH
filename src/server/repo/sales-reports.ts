import "server-only";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/catalog";
import { getDb } from "../db";

// Báo cáo bán hàng (YC-BC-01). Đơn tính theo ngày đặt (`created_at`), ngày theo giờ Việt Nam (UTC+7).
// Doanh thu chỉ gồm đơn `completed`; bán chạy không tính đơn đã huỷ.
const VN = 7 * 3600 * 1000;
const DAY = 86400 * 1000;
const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
export const MAX_RANGE_DAYS = 366;

export type SalesReport = {
  // Khoảng [from, to), mili giây; mặc định 30 ngày gần nhất tính cả hôm nay.
  from: number;
  to: number;
  orders: number;
  revenue: number;
  cancelRate: number;
  byStatus: Record<OrderStatus, { count: number; total: number }>;
  daily: { day: number; orders: number; completed: number; cancelled: number; revenue: number }[];
  topProducts: { productId: string; name: string; quantity: number; amount: number }[];
};

export async function salesReport(range: { from?: number; to?: number } = {}): Promise<SalesReport> {
  const db = await getDb();
  let { from, to } = range;
  if (from === undefined || to === undefined) {
    // Mốc hôm nay lấy từ đồng hồ CSDL (không gọi Date.now() khi dựng trang).
    const today = Number((await db.execute(`SELECT ((${NOW} + ${VN}) / ${DAY} * ${DAY} - ${VN}) AS t`)).rows[0].t);
    to ??= today + DAY;
    from ??= to - 30 * DAY;
  }
  const args = [from, to];
  const [statuses, days, top] = await db.batch([
    { sql: "SELECT status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status", args },
    {
      sql: `SELECT (created_at + ${VN}) / ${DAY} * ${DAY} - ${VN} AS day, COUNT(*) AS n,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
              COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0) AS revenue
            FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY day ORDER BY day`,
      args,
    },
    {
      sql: `SELECT oi.product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS quantity, SUM(oi.quantity * oi.unit_price) AS amount
            FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < ?
            GROUP BY oi.product_id ORDER BY quantity DESC, name LIMIT 20`,
      args,
    },
  ]);
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, { count: 0, total: 0 }])) as SalesReport["byStatus"];
  for (const row of statuses.rows) {
    const status = ORDER_STATUSES.find((s) => s === row.status);
    if (status) byStatus[status] = { count: Number(row.n), total: Number(row.total) };
  }
  const orders = Object.values(byStatus).reduce((sum, s) => sum + s.count, 0);
  return {
    from,
    to,
    orders,
    revenue: byStatus.completed.total,
    cancelRate: orders === 0 ? 0 : byStatus.cancelled.count / orders,
    byStatus,
    daily: days.rows.map((row) => ({
      day: Number(row.day),
      orders: Number(row.n),
      completed: Number(row.completed),
      cancelled: Number(row.cancelled),
      revenue: Number(row.revenue),
    })),
    topProducts: top.rows.map((row) => ({ productId: String(row.product_id), name: String(row.name), quantity: Number(row.quantity), amount: Number(row.amount) })),
  };
}
