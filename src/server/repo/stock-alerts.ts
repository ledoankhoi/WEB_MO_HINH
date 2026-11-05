import "server-only";
import { getDb } from "../db";
import { newId } from "../ids";
import { withAudit, type AuditEntry } from "./audit";

// "Báo khi có hàng" (migration 017). Cửa hàng chưa gửi email tự động: nhân viên xem danh sách khách chờ ở
// /admin/khach-hang/cho-hang, tự liên hệ rồi đánh dấu đã báo.

export type StockAlertContact = { contact: string; kind: "email" | "phone" };
export type StockAlertResult = "created" | "duplicate" | "not_found" | "limit";

// Số yêu cầu đang chờ tối đa của một liên hệ, chặn đăng ký hàng loạt.
export const MAX_PENDING_ALERTS_PER_CONTACT = 30;

const SELLABLE = "FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.is_active AND p.status = 'published'";

// Khách đăng ký báo khi có hàng cho một phiên bản đang bán. Đăng ký lặp (cùng liên hệ, cùng phiên bản, chưa báo)
// không tạo dòng mới.
export async function createStockAlert(input: { variantId: string; contact: StockAlertContact; userId: string | null }): Promise<StockAlertResult> {
  const db = await getDb();
  const pending = await db.execute({
    sql: "SELECT COUNT(*)::int AS n FROM stock_alerts WHERE contact = ? AND notified_at IS NULL",
    args: [input.contact.contact],
  });
  if (Number(pending.rows[0].n) >= MAX_PENDING_ALERTS_PER_CONTACT) return "limit";
  const result = await db.execute({
    sql: `INSERT INTO stock_alerts (id, variant_id, user_id, contact, contact_kind, created_at)
          SELECT ?, v.id, ?, ?, ?, ? ${SELLABLE}
          ON CONFLICT DO NOTHING`,
    args: [newId(), input.userId, input.contact.contact, input.contact.kind, Date.now(), input.variantId],
  });
  if (result.rowsAffected > 0) return "created";
  const sellable = await db.execute({ sql: `SELECT 1 ${SELLABLE}`, args: [input.variantId] });
  return sellable.rows.length > 0 ? "duplicate" : "not_found";
}

export type StockAlertRow = {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  isDefaultVariant: boolean;
  // Số có thể bán hiện tại của phiên bản.
  stock: number;
  contact: string;
  contactKind: "email" | "phone";
  userId: string | null;
  userName: string | null;
  createdAt: number;
  notifiedAt: number | null;
};

// Danh sách cho quản trị. Đang chờ: phiên bản đã có hàng lại lên đầu (cần báo ngay), rồi tới yêu cầu cũ nhất.
export async function listStockAlerts(query: { status: "pending" | "notified"; page: number; pageSize: number }): Promise<{ items: StockAlertRow[]; total: number }> {
  const db = await getDb();
  const where = query.status === "notified" ? "a.notified_at IS NOT NULL" : "a.notified_at IS NULL";
  const order = query.status === "notified" ? "t.notified_at DESC, t.id" : "(t.stock > 0) DESC, t.created_at, t.id";
  const pageSize = Math.min(Math.max(query.pageSize, 1), 100);
  const page = Math.max(query.page, 1);
  const [count, rows] = await db.batch([
    `SELECT COUNT(*)::int AS total FROM stock_alerts a WHERE ${where}`,
    {
      sql: `SELECT * FROM (
              SELECT a.id, a.contact, a.contact_kind, a.user_id, a.created_at, a.notified_at, v.name AS variant_name, v.sku,
                     v.is_default, p.id AS product_id, p.name AS product_name, p.slug AS product_slug, u.name AS user_name,
                     COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = v.id), 0)::int AS stock
              FROM stock_alerts a
              JOIN product_variants v ON v.id = a.variant_id
              JOIN products p ON p.id = v.product_id
              LEFT JOIN users u ON u.id = a.user_id
              WHERE ${where}
            ) t ORDER BY ${order} LIMIT ? OFFSET ?`,
      args: [pageSize, (page - 1) * pageSize],
    },
  ]);
  return {
    total: Number(count.rows[0].total),
    items: rows.rows.map((row) => ({
      id: String(row.id),
      productId: String(row.product_id),
      productName: String(row.product_name),
      productSlug: String(row.product_slug),
      variantName: String(row.variant_name),
      sku: String(row.sku),
      isDefaultVariant: Boolean(row.is_default),
      stock: Number(row.stock),
      contact: String(row.contact),
      contactKind: row.contact_kind === "phone" ? "phone" : "email",
      userId: row.user_id === null ? null : String(row.user_id),
      userName: row.user_name === null ? null : String(row.user_name),
      createdAt: Number(row.created_at),
      notifiedAt: row.notified_at === null ? null : Number(row.notified_at),
    })),
  };
}

// Đánh dấu đã báo khách; mỗi dòng đổi được ghi một dòng nhật ký. Trả về số dòng đã đổi.
export async function markStockAlertsNotified(ids: readonly string[], entry: AuditEntry): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      {
        sql: `UPDATE stock_alerts SET notified_at = ?, notified_by = ? WHERE id IN (${ids.map(() => "?").join(", ")}) AND notified_at IS NULL`,
        args: [Date.now(), entry.actor.id, ...ids],
      },
      entry,
    ),
  );
  return result.rowsAffected;
}
