import "server-only";
import type { StockDocumentStatus, StockDocumentType } from "@/lib/stock";
import { getDb, isConstraintError, type InStatement, type InValue, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";
import { DEFAULT_WAREHOUSE, movementStatements, type Guard, type Movement } from "./inventory";

// Phiếu kho (docs/chuan/03 mục 4, docs/chuan/04 mục 6.1). Nháp không tác động tồn; chỉ ghi sổ (K4) mới tạo
// dòng sổ kho, trong một giao dịch, và chỉ một lần.

export type DocumentType = StockDocumentType;
export type DocumentStatus = StockDocumentStatus;

export const DOCUMENT_PREFIX: Record<DocumentType, string> = {
  receipt: "PN",
  issue: "PX",
  adjustment: "DC",
  transfer: "CV",
  stocktake: "KK",
  return: "HT",
};

export type DocumentLine = {
  variantId: string;
  sku: string;
  name: string;
  locationId: string;
  locationCode: string;
  toLocationId: string | null;
  toLocationCode: string | null;
  qtyExpected: number | null;
  qty: number | null;
  qtyQuarantined: number | null;
  systemQty: number | null;
  unitCost: number | null;
  note: string;
};

export type StockDocument = {
  id: string;
  code: string;
  type: DocumentType;
  status: DocumentStatus;
  supplierId: string | null;
  supplierName: string | null;
  orderId: string | null;
  orderCode: string | null;
  reasonCode: string;
  reference: string;
  note: string;
  expectedAt: number | null;
  createdBy: string | null;
  createdByName: string | null;
  postedByName: string | null;
  createdAt: number;
  submittedAt: number | null;
  postedAt: number | null;
  cancelledAt: number | null;
  // Kiểm kê: lúc chụp số sổ sách và các vị trí được đếm.
  snapshotAt: number | null;
  countLocations: string[];
  lines: DocumentLine[];
};

export type DocumentSummary = Omit<StockDocument, "lines"> & { lineCount: number; totalQty: number };

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toDocument(row: Row): Omit<StockDocument, "lines"> {
  return {
    id: String(row.id),
    code: String(row.code),
    type: String(row.type) as DocumentType,
    status: String(row.status) as DocumentStatus,
    supplierId: row.supplier_id === null ? null : String(row.supplier_id),
    supplierName: row.supplier_name === null || row.supplier_name === undefined ? null : String(row.supplier_name),
    orderId: row.order_id === null ? null : String(row.order_id),
    orderCode: row.order_code === null || row.order_code === undefined ? null : String(row.order_code),
    reasonCode: String(row.reason_code),
    reference: String(row.reference),
    note: String(row.note),
    expectedAt: num(row.expected_at),
    createdBy: row.created_by === null ? null : String(row.created_by),
    createdByName: row.created_by_name === null || row.created_by_name === undefined ? null : String(row.created_by_name),
    postedByName: row.posted_by_name === null || row.posted_by_name === undefined ? null : String(row.posted_by_name),
    createdAt: Number(row.created_at),
    submittedAt: num(row.submitted_at),
    postedAt: num(row.posted_at),
    cancelledAt: num(row.cancelled_at),
    snapshotAt: num(row.snapshot_at),
    countLocations: (() => {
      try {
        const parsed: unknown = JSON.parse(String(row.count_locations ?? "[]"));
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })(),
  };
}

const HEADER_SQL = `SELECT d.*, s.name AS supplier_name, c.name AS created_by_name, p.name AS posted_by_name, o.code AS order_code
                    FROM stock_documents d
                    LEFT JOIN orders o ON o.id = d.order_id
                    LEFT JOIN suppliers s ON s.id = d.supplier_id
                    LEFT JOIN users c ON c.id = d.created_by
                    LEFT JOIN users p ON p.id = d.posted_by`;

export async function findDocument(id: string): Promise<StockDocument | null> {
  const db = await getDb();
  const [header, lines] = await db.batch([
    { sql: `${HEADER_SQL} WHERE d.id = ?`, args: [id] },
    {
      sql: `SELECT l.*, v.sku, p.name || ' (' || v.name || ')' AS name, loc.code AS location_code, tl.code AS to_location_code
            FROM stock_document_lines l
            LEFT JOIN locations tl ON tl.id = l.to_location_id
            JOIN product_variants v ON v.id = l.variant_id
            JOIN products p ON p.id = v.product_id
            JOIN locations loc ON loc.id = l.location_id
            WHERE l.document_id = ? ORDER BY l.id`,
      args: [id],
    },
  ]);
  if (!header.rows[0]) return null;
  return {
    ...toDocument(header.rows[0]),
    lines: lines.rows.map((row) => ({
      variantId: String(row.variant_id),
      sku: String(row.sku),
      name: String(row.name),
      locationId: String(row.location_id),
      locationCode: String(row.location_code),
      toLocationId: row.to_location_id === null ? null : String(row.to_location_id),
      toLocationCode: row.to_location_code === null ? null : String(row.to_location_code),
      qtyExpected: num(row.qty_expected),
      qty: num(row.qty),
      qtyQuarantined: num(row.qty_quarantined),
      systemQty: num(row.system_qty),
      unitCost: num(row.unit_cost),
      note: String(row.note),
    })),
  };
}

export async function listDocuments(query: {
  type?: DocumentType;
  status?: DocumentStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ items: DocumentSummary[]; total: number }> {
  const filters: [string, InValue][] = [];
  if (query.type) filters.push(["d.type = ?", query.type]);
  if (query.status) filters.push(["d.status = ?", query.status]);
  const where = filters.length ? `WHERE ${filters.map(([sql]) => sql).join(" AND ")}` : "";
  const args = filters.map(([, value]) => value);
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*) AS total FROM stock_documents d ${where}`, args },
    {
      sql: `SELECT h.*, (SELECT COUNT(*) FROM stock_document_lines l WHERE l.document_id = h.id) AS line_count,
                   (SELECT COALESCE(SUM(l.qty), 0) FROM stock_document_lines l WHERE l.document_id = h.id) AS total_qty
            FROM (${HEADER_SQL} ${where}) h ORDER BY h.created_at DESC, h.id LIMIT ? OFFSET ?`,
      args: [...args, pageSize, (page - 1) * pageSize],
    },
  ]);
  return {
    items: rows.rows.map((row) => ({ ...toDocument(row), lineCount: Number(row.line_count), totalQty: Number(row.total_qty) })),
    total: Number(count.rows[0].total),
  };
}

// Mã phiếu QT-18: <tiền tố>-<YYMMDD giờ Việt Nam>-<4 ký tự>.
function documentCode(type: DocumentType, now: number): string {
  const date = new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(2, 10).replace(/-/g, "");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join("");
  return `${DOCUMENT_PREFIX[type]}-${date}-${random}`;
}

// Tạo phiếu nháp rỗng (K1). Trả về id.
export async function createDocument(type: DocumentType, entry: AuditEntry): Promise<string> {
  const db = await getDb();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    const now = Date.now();
    const code = documentCode(type, now);
    try {
      await db.batch([
        {
          sql: `INSERT INTO stock_documents (id, code, type, status, warehouse_id, created_by, created_at, updated_at)
                VALUES (?, ?, ?, 'draft', ${DEFAULT_WAREHOUSE}, ?, ?, ?)`,
          args: [id, code, type, entry.actor.id, now, now],
        },
        auditStatement({ ...entry, entityId: id, summary: `${entry.summary} ${code}` }),
      ]);
      return id;
    } catch (error) {
      if (!isConstraintError(error) || error.statementIndex !== 0) throw error;
    }
  }
  throw new Error("Không tạo được mã phiếu duy nhất");
}

export type DraftInput = {
  supplierId: string | null;
  orderId: string | null;
  reasonCode: string;
  reference: string;
  note: string;
  expectedAt: number | null;
  lines: Omit<DocumentLine, "sku" | "name" | "locationCode" | "toLocationCode">[];
};

// Lưu phần đầu và thay toàn bộ dòng của phiếu nháp (K1). Trả về false khi phiếu không còn là nháp.
export async function saveDraft(id: string, input: DraftInput): Promise<boolean> {
  const db = await getDb();
  const isDraft = "EXISTS (SELECT 1 FROM stock_documents WHERE id = ? AND status = 'draft')";
  const statements: InStatement[] = [
    { sql: "SELECT id FROM stock_documents WHERE id = ? FOR UPDATE", args: [id] },
    { sql: `DELETE FROM stock_document_lines WHERE document_id = ? AND ${isDraft}`, args: [id, id] },
    ...input.lines.map((line) => ({
      sql: `INSERT INTO stock_document_lines (document_id, variant_id, location_id, to_location_id, qty_expected, qty, qty_quarantined, system_qty, unit_cost, note)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${isDraft}`,
      args: [id, line.variantId, line.locationId, line.toLocationId, line.qtyExpected, line.qty, line.qtyQuarantined, line.systemQty, line.unitCost, line.note, id],
    })),
    {
      sql: `UPDATE stock_documents SET supplier_id = ?, order_id = ?, reason_code = ?, reference = ?, note = ?, expected_at = ?, updated_at = ?
            WHERE id = ? AND status = 'draft'`,
      args: [input.supplierId, input.orderId, input.reasonCode, input.reference, input.note, input.expectedAt, Date.now(), id],
    },
  ];
  const results = await db.batch(statements);
  return results[results.length - 1].rowsAffected > 0;
}

// K2 gửi, K3 trả lại, K5 huỷ: chỉ đổi trạng thái, không tác động tồn.
const TRANSITIONS = {
  submit: { from: ["draft"], to: "submitted", column: "submitted_at" },
  return: { from: ["submitted"], to: "draft", column: null },
  cancel: { from: ["draft", "submitted"], to: "cancelled", column: "cancelled_at" },
} as const;

export async function changeDocumentStatus(id: string, transition: keyof typeof TRANSITIONS, entry: AuditEntry): Promise<boolean> {
  const { from, to, column } = TRANSITIONS[transition];
  const now = Date.now();
  const extra = column === "cancelled_at" ? ", cancelled_at = ?, cancelled_by = ?" : column ? `, ${column} = ?` : "";
  const extraArgs: InValue[] = column === "cancelled_at" ? [now, entry.actor.id] : column ? [now] : [];
  const lineCheck = transition === "submit" ? "AND EXISTS (SELECT 1 FROM stock_document_lines WHERE document_id = stock_documents.id)" : "";
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      {
        sql: `UPDATE stock_documents SET status = ?, updated_at = ?${extra}
              WHERE id = ? AND status IN (${from.map(() => "?").join(", ")}) ${lineCheck}`,
        args: [to, now, ...extraArgs, id, ...from],
      },
      entry,
    ),
  );
  return result.rowsAffected > 0;
}

export type PostResult = { ok: true } | { ok: false; reason: "state" | "invalid" | "stock"; message?: string };

// Ghi sổ (K4) nguyên tử và chống lặp (QT-13, Q16): khoá dòng phiếu, mọi lệnh ghi chỉ chạy khi phiếu còn ở
// nháp hoặc chờ ghi sổ, rồi mới đổi trạng thái. Lần gửi thứ hai (kể cả song song) không ghi gì.
export async function postDocument(id: string, entry: AuditEntry): Promise<PostResult> {
  const document = await findDocument(id);
  if (!document || (document.status !== "draft" && document.status !== "submitted")) return { ok: false, reason: "state" };
  const now = Date.now();
  const guard: Guard = { sql: "EXISTS (SELECT 1 FROM stock_documents WHERE id = ? AND status IN ('draft', 'submitted'))", args: [id] };
  const base = { documentId: id, actorId: entry.actor.id, now };
  const statements: InStatement[] = [{ sql: "SELECT id FROM stock_documents WHERE id = ? FOR UPDATE", args: [id] }];
  const move = (movement: Omit<Movement, "documentId" | "actorId" | "now">) => statements.push(...movementStatements({ ...movement, ...base }, guard));

  if (document.lines.length === 0) return { ok: false, reason: "invalid", message: "Phiếu chưa có dòng nào." };

  if (document.type === "receipt") {
    const db = await getDb();
    const quarantine = String((await db.execute("SELECT id FROM locations WHERE type = 'quarantine' AND is_active ORDER BY code LIMIT 1")).rows[0]?.id ?? "");
    const quarantined = new Map<string, number>();
    for (const line of document.lines) {
      const qty = line.qty ?? 0;
      const bad = line.qtyQuarantined ?? 0;
      if (qty <= 0 && bad <= 0) continue;
      // Giá vốn bình quân gia quyền (Q11), tính trên tồn cũ gồm cả hàng cách ly, trước khi cộng hàng mới.
      statements.push(
        { sql: `INSERT INTO inventory (variant_id, warehouse_id) VALUES (?, ${DEFAULT_WAREHOUSE}) ON CONFLICT DO NOTHING`, args: [line.variantId] },
        {
          sql: `UPDATE inventory SET
                  avg_cost = ROUND(((on_hand + quarantined) * avg_cost + ?::bigint * ?::bigint)::numeric / (on_hand + quarantined + ?::int)),
                  last_received_at = ?
                WHERE variant_id = ? AND warehouse_id = ${DEFAULT_WAREHOUSE} AND ${guard.sql}`,
          args: [qty, line.unitCost ?? 0, qty, now, line.variantId, ...guard.args],
        },
      );
      if (qty - bad > 0) move({ variantId: line.variantId, locationId: line.locationId, type: "receive", qtyDelta: qty - bad, unitCost: line.unitCost });
      if (bad > 0) quarantined.set(line.variantId, (quarantined.get(line.variantId) ?? 0) + bad);
    }
    if (quarantined.size > 0 && !quarantine) return { ok: false, reason: "invalid", message: "Kho chưa có vị trí cách ly đang dùng." };
    for (const [variantId, qty] of quarantined) {
      move({ variantId, locationId: quarantine, type: "receive", qtyDelta: qty, reason: "Nhận vào cách ly" });
    }
  } else if (document.type === "issue") {
    // QT-15: xuất từ kệ hàng không được lấy phần đã giữ cho đơn; ràng buộc reserved ≤ on_hand chặn ở CSDL.
    for (const line of document.lines) {
      if ((line.qty ?? 0) > 0) move({ variantId: line.variantId, locationId: line.locationId, type: "issue", qtyDelta: -(line.qty ?? 0), reason: document.reasonCode });
    }
  } else if (document.type === "transfer") {
    for (const line of document.lines) {
      const qty = line.qty ?? 0;
      if (qty <= 0 || !line.toLocationId) continue;
      move({ variantId: line.variantId, locationId: line.locationId, type: "transfer_out", qtyDelta: -qty });
      move({ variantId: line.variantId, locationId: line.toLocationId, type: "transfer_in", qtyDelta: qty });
    }
  } else if (document.type === "return") {
    // Hàng trả luôn vào khu cách ly, chưa bán lại được (YC-KHO-08, Q15).
    for (const line of document.lines) {
      if ((line.qty ?? 0) > 0) move({ variantId: line.variantId, locationId: line.locationId, type: "return_in", qtyDelta: line.qty ?? 0, orderId: document.orderId });
    }
  } else if (document.type === "adjustment") {
    for (const line of document.lines) {
      const qty = line.qty ?? 0;
      if (qty !== 0) move({ variantId: line.variantId, locationId: line.locationId, type: qty > 0 ? "adjust_in" : "adjust_out", qtyDelta: qty, reason: document.reasonCode });
    }
  } else if (document.type === "stocktake") {
    if (!document.snapshotAt) return { ok: false, reason: "invalid", message: "Phiếu kiểm kê chưa chụp số sổ sách." };
    if (document.lines.some((line) => line.qty === null)) return { ok: false, reason: "invalid", message: "Còn dòng chưa nhập số đếm." };
    // WH-06: vị trí có biến động sau lúc chụp số thì số đếm không còn so được với sổ sách.
    const changed = await movedSince(document.countLocations, document.snapshotAt);
    if (changed) return { ok: false, reason: "invalid", message: `Vị trí ${changed} có biến động sau lúc chụp số. Hãy huỷ phiếu và kiểm kê lại.` };
    guard.sql += ` AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.location_id IN (SELECT jsonb_array_elements_text(count_locations::jsonb) FROM stock_documents WHERE id = ?) AND m.created_at > ? AND m.document_id IS DISTINCT FROM ?)`;
    // Trừ chính các dòng phiếu này đang ghi trong cùng giao dịch.
    guard.args.push(id, document.snapshotAt, id);
    for (const line of document.lines) {
      const diff = (line.qty ?? 0) - (line.systemQty ?? 0);
      if (diff !== 0) move({ variantId: line.variantId, locationId: line.locationId, type: diff > 0 ? "adjust_in" : "adjust_out", qtyDelta: diff, reason: diff > 0 ? "count_gain" : "count_loss" });
    }
  } else {
    return { ok: false, reason: "invalid", message: "Loại phiếu này chưa ghi sổ được." };
  }

  statements.push(
    withAudit(
      {
        // Cùng điều kiện với các lệnh ghi kho: điều kiện sai thì không dòng nào ghi và phiếu cũng không đổi.
        sql: `UPDATE stock_documents SET status = 'posted', posted_by = ?, posted_at = ?, updated_at = ? WHERE id = ? AND ${guard.sql}`,
        args: [entry.actor.id, now, now, id, ...guard.args],
      },
      entry,
    ),
  );
  const db = await getDb();
  try {
    const results = await db.batch(statements);
    return results[results.length - 1].rowsAffected > 0 ? { ok: true } : { ok: false, reason: "state" };
  } catch (error) {
    // Khoá duy nhất của sổ kho (ghi trùng) hoặc CHECK số dư (không đủ hàng ở vị trí): không ghi gì.
    if (isConstraintError(error)) return { ok: false, reason: "stock" };
    throw error;
  }
}

// Mã vị trí đầu tiên có dòng sổ kho sau thời điểm `since`, hoặc null.
async function movedSince(locationIds: string[], since: number): Promise<string | null> {
  if (locationIds.length === 0) return null;
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT l.code FROM stock_movements m JOIN locations l ON l.id = m.location_id
          WHERE m.location_id IN (${locationIds.map(() => "?").join(", ")}) AND m.created_at > ? ORDER BY l.code LIMIT 1`,
    args: [...locationIds, since],
  });
  return result.rows[0] ? String(result.rows[0].code) : null;
}

// Vị trí đang thuộc một phiếu kiểm kê chưa ghi sổ khác (QT-16).
export async function locationsInOpenStocktakes(exceptId: string): Promise<Set<string>> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT count_locations FROM stock_documents WHERE type = 'stocktake' AND status IN ('draft', 'submitted') AND id <> ?",
    args: [exceptId],
  });
  return new Set(result.rows.flatMap((row) => JSON.parse(String(row.count_locations)) as string[]));
}

// Bắt đầu kiểm kê (YC-KHO-07): chụp số sổ sách của mọi biến thể đang có ở các vị trí đã chọn thành dòng phiếu
// (system_qty), số đếm để trống. Chỉ làm một lần, khi phiếu còn nháp và chưa chụp.
// shortcut: QT-16 kiểm ở lớp action trước khi gọi; hai người chụp cùng lúc cùng vị trí có thể lọt, khi nhiều kho
// thật thì khoá theo vị trí.
export async function startStocktake(id: string, locationIds: string[], entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const open = "EXISTS (SELECT 1 FROM stock_documents WHERE id = ? AND type = 'stocktake' AND status = 'draft' AND snapshot_at IS NULL)";
  const results = await db.batch([
    { sql: "SELECT id FROM stock_documents WHERE id = ? FOR UPDATE", args: [id] },
    {
      sql: `INSERT INTO stock_document_lines (document_id, variant_id, location_id, system_qty)
            SELECT ?, s.variant_id, s.location_id, s.on_hand FROM stock_levels s
            WHERE s.location_id IN (${locationIds.map(() => "?").join(", ")}) AND s.on_hand > 0 AND ${open}`,
      args: [id, ...locationIds, id],
    },
    withAudit(
      {
        sql: "UPDATE stock_documents SET snapshot_at = ?, count_locations = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND snapshot_at IS NULL",
        args: [now, JSON.stringify(locationIds), now, id],
      },
      entry,
    ),
  ]);
  return results[results.length - 1].rowsAffected > 0;
}
