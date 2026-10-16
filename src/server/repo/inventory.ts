import "server-only";
import { getDb, type InStatement, type InValue } from "../db";

// Kho mặc định (Q2: MVP có đúng một kho).
export const DEFAULT_WAREHOUSE = "(SELECT id FROM warehouses WHERE code = 'KHO-01')";

export type MovementType =
  | "receive"
  | "reserve"
  | "release"
  | "ship"
  | "return_in"
  | "issue"
  | "transfer_out"
  | "transfer_in"
  | "adjust_in"
  | "adjust_out";

export type Movement = {
  variantId: string;
  // NULL với reserve, release (chỉ đổi số đang giữ của cả kho).
  locationId: string | null;
  type: MovementType;
  qtyDelta: number;
  reservedDelta?: number;
  unitCost?: number | null;
  documentId?: string | null;
  orderId?: string | null;
  reason?: string;
  actorId?: string | null;
  now: number;
};

// Điều kiện SQL (ví dụ "đơn còn ở trạng thái X") gắn vào mọi lệnh ghi: sai thì không ghi gì.
export type Guard = { sql: string; args: InValue[] };

// Một biến động = một dòng sổ kho + cập nhật số dư theo vị trí (`stock_levels`) và số tổng (`inventory`),
// phải chạy trong cùng `batch` với thao tác gây ra nó (QT-11). Số dư cộng bằng UPDATE để ràng buộc CHECK
// (không âm, reserved ≤ on_hand) chặn và huỷ cả giao dịch; dòng số dư được tạo trước với số 0.
export function movementStatements(m: Movement, guard?: Guard): InStatement[] {
  const reservedDelta = m.reservedDelta ?? 0;
  const where = guard ? `AND ${guard.sql}` : "";
  const guardArgs = guard?.args ?? [];
  const warehouse = m.locationId ? "(SELECT warehouse_id FROM locations WHERE id = ?)" : DEFAULT_WAREHOUSE;
  const warehouseArgs = m.locationId ? [m.locationId] : [];
  const statements: InStatement[] = [
    {
      sql: `INSERT INTO stock_movements (
              variant_id, warehouse_id, location_id, type, qty_delta, reserved_delta, unit_cost,
              document_id, order_id, reason, actor_id, created_at
            ) SELECT ?, ${warehouse}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE true ${where}`,
      args: [
        m.variantId,
        ...warehouseArgs,
        m.locationId,
        m.type,
        m.qtyDelta,
        reservedDelta,
        m.unitCost ?? null,
        m.documentId ?? null,
        m.orderId ?? null,
        m.reason ?? "",
        m.actorId ?? null,
        m.now,
        ...guardArgs,
      ],
    },
    {
      sql: `INSERT INTO inventory (variant_id, warehouse_id) VALUES (?, ${warehouse}) ON CONFLICT DO NOTHING`,
      args: [m.variantId, ...warehouseArgs],
    },
  ];

  if (m.locationId && m.qtyDelta !== 0) {
    statements.push(
      {
        sql: "INSERT INTO stock_levels (variant_id, location_id, on_hand, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT DO NOTHING",
        args: [m.variantId, m.locationId, m.now],
      },
      {
        sql: `UPDATE stock_levels SET on_hand = on_hand + ?, updated_at = ? WHERE variant_id = ? AND location_id = ? ${where}`,
        args: [m.qtyDelta, m.now, m.variantId, m.locationId, ...guardArgs],
      },
    );
  }

  const type = m.locationId ? "(SELECT type FROM locations WHERE id = ?)" : "NULL";
  const typeArgs = m.locationId ? [m.locationId] : [];
  statements.push({
    sql: `UPDATE inventory SET
            on_hand = on_hand + CASE WHEN ${type} = 'storage' THEN ? ELSE 0 END,
            quarantined = quarantined + CASE WHEN ${type} = 'quarantine' THEN ? ELSE 0 END,
            reserved = reserved + ?
          WHERE variant_id = ? AND warehouse_id = ${warehouse} ${where}`,
    args: [...typeArgs, m.qtyDelta, ...typeArgs, m.qtyDelta, reservedDelta, m.variantId, ...warehouseArgs, ...guardArgs],
  });
  return statements;
}

// Lấy hàng cho một dòng đơn (Q7): các vị trí `storage` có hàng, mã vị trí tăng dần, được tách nhiều vị trí.
// shortcut: đọc ngoài giao dịch; nếu tồn vừa đổi thì ràng buộc CHECK huỷ cả lô, người dùng bấm lại.
export async function allocateStorage(variantId: string, quantity: number): Promise<{ locationId: string; qty: number }[] | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT s.location_id, s.on_hand FROM stock_levels s JOIN locations l ON l.id = s.location_id
          WHERE s.variant_id = ? AND l.type = 'storage' AND s.on_hand > 0 ORDER BY l.code`,
    args: [variantId],
  });
  const picks: { locationId: string; qty: number }[] = [];
  let left = quantity;
  for (const row of result.rows) {
    if (left === 0) break;
    const qty = Math.min(left, Number(row.on_hand));
    picks.push({ locationId: String(row.location_id), qty });
    left -= qty;
  }
  return left === 0 ? picks : null;
}

// Đối soát (YC-KHO-18): trả về mô tả từng sai lệch giữa sổ kho và số dư; rỗng là khớp.
export async function findInventoryDiscrepancies(): Promise<string[]> {
  const db = await getDb();
  const [levels, totals, reserved] = await db.batch([
    `SELECT COALESCE(s.variant_id, m.variant_id) AS variant_id, COALESCE(s.location_id, m.location_id) AS location_id,
            COALESCE(s.on_hand, 0) AS balance, COALESCE(m.total, 0) AS ledger
     FROM stock_levels s
     FULL JOIN (SELECT variant_id, location_id, SUM(qty_delta) AS total FROM stock_movements
                WHERE location_id IS NOT NULL GROUP BY variant_id, location_id) m
       ON m.variant_id = s.variant_id AND m.location_id = s.location_id
     WHERE COALESCE(s.on_hand, 0) <> COALESCE(m.total, 0)`,
    `SELECT i.variant_id, i.on_hand, i.quarantined, i.reserved,
            COALESCE(SUM(s.on_hand) FILTER (WHERE l.type = 'storage'), 0) AS storage,
            COALESCE(SUM(s.on_hand) FILTER (WHERE l.type = 'quarantine'), 0) AS quarantine,
            (SELECT COALESCE(SUM(reserved_delta), 0) FROM stock_movements m WHERE m.variant_id = i.variant_id) AS ledger_reserved
     FROM inventory i
     LEFT JOIN stock_levels s ON s.variant_id = i.variant_id
     LEFT JOIN locations l ON l.id = s.location_id AND l.warehouse_id = i.warehouse_id
     GROUP BY i.variant_id, i.warehouse_id, i.on_hand, i.quarantined, i.reserved`,
    // Đơn còn giữ hàng là đơn đã đặt nhưng chưa xuất kho, chưa huỷ.
    `SELECT i.variant_id, i.reserved, COALESCE(o.total, 0) AS open_orders
     FROM inventory i
     LEFT JOIN (SELECT oi.variant_id, SUM(oi.quantity) AS total FROM order_items oi JOIN orders ord ON ord.id = oi.order_id
                WHERE ord.status IN ('pending', 'confirmed') GROUP BY oi.variant_id) o ON o.variant_id = i.variant_id
     WHERE i.reserved <> COALESCE(o.total, 0)`,
  ]);
  const issues: string[] = [];
  for (const r of levels.rows) {
    issues.push(`Vị trí ${r.location_id}, biến thể ${r.variant_id}: số dư ${r.balance}, sổ kho ${r.ledger}`);
  }
  for (const r of totals.rows) {
    if (Number(r.on_hand) !== Number(r.storage)) issues.push(`Biến thể ${r.variant_id}: on_hand ${r.on_hand}, tổng vị trí bán được ${r.storage}`);
    if (Number(r.quarantined) !== Number(r.quarantine)) issues.push(`Biến thể ${r.variant_id}: quarantined ${r.quarantined}, tổng vị trí cách ly ${r.quarantine}`);
    if (Number(r.reserved) !== Number(r.ledger_reserved)) issues.push(`Biến thể ${r.variant_id}: reserved ${r.reserved}, sổ kho ${r.ledger_reserved}`);
  }
  for (const r of reserved.rows) {
    issues.push(`Biến thể ${r.variant_id}: đang giữ ${r.reserved}, đơn chưa xuất ${r.open_orders}`);
  }
  return issues;
}
