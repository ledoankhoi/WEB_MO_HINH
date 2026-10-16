import "server-only";
import { getDb, type InValue } from "../db";

// Báo cáo kho (docs/chuan/10 mục 4.2): danh sách tồn, thẻ kho, phiếu chờ xử lý, giá trị tồn.

export const AGING_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
// Giờ của CSDL: không dùng Date.now() lúc dựng trang (CLAUDE.md).
const NOW_MS = "(extract(epoch FROM now()) * 1000)::bigint";

export type StockFilter = "low" | "out" | "quarantine" | "aging";
export const STOCK_FILTERS: Record<StockFilter, string> = {
  low: "Sắp hết",
  out: "Hết hàng",
  quarantine: "Có hàng cách ly",
  aging: `Tồn trên ${AGING_DAYS} ngày`,
};

export type StockRow = {
  variantId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  name: string;
  productStatus: string;
  onHand: number;
  reserved: number;
  available: number;
  quarantined: number;
  threshold: number;
  // Số ngày từ lần nhập gần nhất; null khi chưa nhập lần nào.
  ageDays: number | null;
  // Chỉ có khi người xem có quyền cost.view (SEC-03).
  avgCost?: number;
  value?: number;
};

export type StockQuery = {
  q?: string;
  filter?: StockFilter;
  locationId?: string;
  variantId?: string;
  page?: number;
  pageSize?: number;
  withCost: boolean;
};

export async function listStock(query: StockQuery): Promise<{ items: StockRow[]; total: number }> {
  const where: string[] = [];
  const args: InValue[] = [];
  const term = query.q?.trim();
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(v.sku ILIKE ? ESCAPE '\\' OR v.barcode = ? OR p.name ILIKE ? ESCAPE '\\')");
    args.push(like, term, like);
  }
  if (query.variantId) {
    where.push("v.id = ?");
    args.push(query.variantId);
  }
  if (query.locationId) {
    where.push("EXISTS (SELECT 1 FROM stock_levels s WHERE s.variant_id = v.id AND s.location_id = ? AND s.on_hand > 0)");
    args.push(query.locationId);
  }
  if (query.filter === "low") where.push("COALESCE(i.on_hand - i.reserved, 0) BETWEEN 1 AND COALESCE(i.low_stock_threshold, 3)");
  if (query.filter === "out") where.push("COALESCE(i.on_hand - i.reserved, 0) <= 0");
  if (query.filter === "quarantine") where.push("COALESCE(i.quarantined, 0) > 0");
  if (query.filter === "aging") {
    where.push(`i.on_hand + i.quarantined > 0 AND i.last_received_at < ${NOW_MS} - ?`);
    args.push(AGING_DAYS * DAY_MS);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 200);
  const page = Math.max(query.page ?? 1, 1);
  const from = `FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN inventory i ON i.variant_id = v.id ${whereSql}`;
  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*) AS total ${from}`, args },
    {
      sql: `SELECT v.id, v.product_id, v.sku, v.barcode, p.name || ' (' || v.name || ')' AS name, p.status,
                   COALESCE(i.on_hand, 0) AS on_hand, COALESCE(i.reserved, 0) AS reserved, COALESCE(i.quarantined, 0) AS quarantined,
                   COALESCE(i.low_stock_threshold, 3) AS threshold, COALESCE(i.avg_cost, 0) AS avg_cost,
                   CASE WHEN i.last_received_at IS NULL THEN NULL ELSE (${NOW_MS} - i.last_received_at) / ${DAY_MS} END AS age_days
            ${from} ORDER BY v.sku LIMIT ? OFFSET ?`,
      args: [...args, pageSize, (page - 1) * pageSize],
    },
  ]);
  return {
    total: Number(count.rows[0].total),
    items: rows.rows.map((row) => {
      const onHand = Number(row.on_hand);
      const reserved = Number(row.reserved);
      const quarantined = Number(row.quarantined);
      const item: StockRow = {
        variantId: String(row.id),
        productId: String(row.product_id),
        sku: String(row.sku),
        barcode: row.barcode === null ? null : String(row.barcode),
        name: String(row.name),
        productStatus: String(row.status),
        onHand,
        reserved,
        available: onHand - reserved,
        quarantined,
        threshold: Number(row.threshold),
        ageDays: row.age_days === null ? null : Number(row.age_days),
      };
      if (query.withCost) {
        item.avgCost = Number(row.avg_cost);
        item.value = (onHand + quarantined) * Number(row.avg_cost);
      }
      return item;
    }),
  };
}

export type StockCardRow = {
  id: number;
  createdAt: number;
  type: string;
  locationCode: string | null;
  qtyDelta: number;
  reservedDelta: number;
  // Tổng thực có của biến thể (mọi vị trí) sau dòng này.
  balance: number;
  actorName: string | null;
  documentId: string | null;
  documentCode: string | null;
  orderId: string | null;
  orderCode: string | null;
  reason: string;
};

// Thẻ kho (YC-KHO-11): mọi dòng sổ kho của một biến thể, mới nhất trước, kèm số dư sau mỗi dòng.
export async function stockCard(variantId: string, limit = 500): Promise<StockCardRow[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT * FROM (
            SELECT m.id, m.created_at, m.type, l.code AS location_code, m.qty_delta, m.reserved_delta, m.reason,
                   SUM(m.qty_delta) OVER (ORDER BY m.id) AS balance, u.name AS actor_name,
                   d.id AS document_id, d.code AS document_code, o.id AS order_id, o.code AS order_code
            FROM stock_movements m
            LEFT JOIN locations l ON l.id = m.location_id
            LEFT JOIN users u ON u.id = m.actor_id
            LEFT JOIN stock_documents d ON d.id = m.document_id
            LEFT JOIN orders o ON o.id = m.order_id
            WHERE m.variant_id = ?
          ) t ORDER BY id DESC LIMIT ?`,
    args: [variantId, limit],
  });
  return result.rows.map((row) => ({
    id: Number(row.id),
    createdAt: Number(row.created_at),
    type: String(row.type),
    locationCode: row.location_code === null ? null : String(row.location_code),
    qtyDelta: Number(row.qty_delta),
    reservedDelta: Number(row.reserved_delta),
    balance: Number(row.balance),
    actorName: row.actor_name === null ? null : String(row.actor_name),
    documentId: row.document_id === null ? null : String(row.document_id),
    documentCode: row.document_code === null ? null : String(row.document_code),
    orderId: row.order_id === null ? null : String(row.order_id),
    orderCode: row.order_code === null ? null : String(row.order_code),
    reason: String(row.reason),
  }));
}

export type PendingWork = {
  drafts: number;
  submitted: number;
  // Phiếu nhập (chưa huỷ) có dòng thực nhận ít hơn dự kiến.
  shortReceipts: { id: string; code: string; status: string }[];
  ordersToPick: number;
  ordersToPack: number;
  ordersToHandOver: number;
};

// Phiếu chờ xử lý (YC-KHO-12).
export async function pendingWork(): Promise<PendingWork> {
  const db = await getDb();
  const [docs, short, orders] = await db.batch([
    "SELECT status, COUNT(*) AS n FROM stock_documents WHERE status IN ('draft', 'submitted') GROUP BY status",
    `SELECT d.id, d.code, d.status FROM stock_documents d
     WHERE d.type = 'receipt' AND d.status <> 'cancelled'
       AND EXISTS (SELECT 1 FROM stock_document_lines l WHERE l.document_id = d.id AND l.qty_expected IS NOT NULL AND COALESCE(l.qty, 0) < l.qty_expected)
     ORDER BY d.created_at DESC LIMIT 20`,
    `SELECT
       COUNT(*) FILTER (WHERE status = 'confirmed') AS to_pick,
       COUNT(*) FILTER (WHERE status = 'processing' AND shipping_status = 'not_created') AS to_pack,
       COUNT(*) FILTER (WHERE shipping_status = 'ready') AS to_hand_over
     FROM orders`,
  ]);
  const byStatus = Object.fromEntries(docs.rows.map((row) => [String(row.status), Number(row.n)]));
  const o = orders.rows[0];
  return {
    drafts: byStatus.draft ?? 0,
    submitted: byStatus.submitted ?? 0,
    shortReceipts: short.rows.map((row) => ({ id: String(row.id), code: String(row.code), status: String(row.status) })),
    ordersToPick: Number(o.to_pick),
    ordersToPack: Number(o.to_pack),
    ordersToHandOver: Number(o.to_hand_over),
  };
}

// Giá trị tồn theo danh mục và tổng (YC-KHO-15, Q11). Chỉ gọi khi người xem có cost.view.
export async function stockValueByCategory(): Promise<{ category: string; value: number; units: number }[]> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT c.name AS category, SUM((i.on_hand + i.quarantined) * i.avg_cost) AS value, SUM(i.on_hand + i.quarantined) AS units
    FROM inventory i
    JOIN product_variants v ON v.id = i.variant_id
    JOIN products p ON p.id = v.product_id
    JOIN categories c ON c.id = p.category_id
    GROUP BY c.name HAVING SUM(i.on_hand + i.quarantined) > 0 ORDER BY value DESC`);
  return result.rows.map((row) => ({ category: String(row.category), value: Number(row.value), units: Number(row.units) }));
}

// Đổi ngưỡng sắp hết của một biến thể (YC-KHO-13).
export async function setLowStockThreshold(variantId: string, threshold: number): Promise<void> {
  const db = await getDb();
  await db.batch([
    { sql: "INSERT INTO inventory (variant_id, warehouse_id) VALUES (?, (SELECT id FROM warehouses WHERE code = 'KHO-01')) ON CONFLICT DO NOTHING", args: [variantId] },
    { sql: "UPDATE inventory SET low_stock_threshold = ? WHERE variant_id = ?", args: [threshold, variantId] },
  ]);
}

// CSV UTF-8 có BOM để Excel mở đúng tiếng Việt (Q22).
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const cell = (value: string | number | null) => {
    // Chặn công thức Excel trong ô chữ (=, +, @, - không theo sau là số).
    const raw = value === null ? "" : String(value);
    const text = typeof value === "string" && /^([=+@]|-(?!\d))/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
