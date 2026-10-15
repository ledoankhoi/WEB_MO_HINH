import "server-only";
import { getDb, type InStatement, type InValue } from "../db";

// Người thao tác; `id` là null khi chưa xác định được (ví dụ đăng nhập thất bại).
export type Actor = { id: string | null; role: string };

export type AuditEntry = {
  actor: Actor;
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  // `{ before, after }` của các trường đã đổi, lý do...
  detail?: Record<string, unknown>;
};

const COLUMNS = "actor_id, actor_role, action, entity, entity_id, summary, detail, created_at";
const values = (entry: AuditEntry): InValue[] => [
  entry.actor.id,
  entry.actor.role,
  entry.action,
  entry.entity,
  entry.entityId ?? "",
  entry.summary,
  JSON.stringify(entry.detail ?? {}),
  Date.now(),
];

export function auditStatement(entry: AuditEntry): InStatement {
  return { sql: `INSERT INTO audit_logs (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, args: values(entry) };
}

// Gói một câu UPDATE/DELETE có điều kiện để chỉ ghi nhật ký khi thật sự có dòng bị đổi, trong cùng câu lệnh.
// `rowsAffected` của kết quả bằng số dòng đã đổi. Câu gốc không được có RETURNING. Không có `entry` thì
// trả lại nguyên câu gốc (thao tác của khách ở cửa hàng không ghi nhật ký).
export function withAudit(statement: { sql: string; args: InValue[] }, entry: AuditEntry | undefined): InStatement {
  if (!entry) return statement;
  const [actorId, actorRole, action, entity, , summary, detail, createdAt] = values(entry);
  return {
    sql: `WITH changed AS (${statement.sql} RETURNING id)
          INSERT INTO audit_logs (${COLUMNS}) SELECT ?, ?, ?, ?, changed.id::text, ?, ?, ? FROM changed`,
    args: [...statement.args, actorId, actorRole, action, entity, summary, detail, createdAt],
  };
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const db = await getDb();
  await db.execute(auditStatement(entry));
}

export type AuditLog = {
  id: number;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  detail: string;
  createdAt: number;
};

export type AuditQuery = {
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  // Mili giây UTC, `from` tính cả, `to` không tính.
  from?: number | null;
  to?: number | null;
  page?: number;
  pageSize?: number;
};

export async function listAuditLogs(query: AuditQuery): Promise<{ items: AuditLog[]; total: number }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 50, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const where: string[] = [];
  const args: InValue[] = [];
  const add = (sql: string, value: InValue) => {
    where.push(sql);
    args.push(value);
  };
  if (query.actorId) add("a.actor_id = ?", query.actorId);
  if (query.action) add("a.action = ?", query.action);
  if (query.entity) add("a.entity = ?", query.entity);
  if (query.entityId) add("a.entity_id = ?", query.entityId);
  if (query.from != null) add("a.created_at >= ?", query.from);
  if (query.to != null) add("a.created_at < ?", query.to);
  const filter = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const db = await getDb();
  const [count, rows] = await db.batch([
    { sql: `SELECT COUNT(*) AS total FROM audit_logs a ${filter}`, args },
    {
      sql: `SELECT a.*, u.name AS actor_name, u.email AS actor_email
            FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
            ${filter} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      args: [...args, pageSize, (page - 1) * pageSize],
    },
  ]);
  return {
    items: rows.rows.map((row) => ({
      id: Number(row.id),
      actorId: row.actor_id === null ? null : String(row.actor_id),
      actorName: String(row.actor_name ?? ""),
      actorEmail: String(row.actor_email ?? ""),
      actorRole: String(row.actor_role),
      action: String(row.action),
      entity: String(row.entity),
      entityId: String(row.entity_id),
      summary: String(row.summary),
      detail: String(row.detail),
      createdAt: Number(row.created_at),
    })),
    total: Number(count.rows[0].total),
  };
}

// Giá trị cho các ô lọc theo hành động và đối tượng.
export async function listAuditFacets(): Promise<{ actions: string[]; entities: string[] }> {
  const db = await getDb();
  const [actions, entities] = await db.batch([
    "SELECT DISTINCT action FROM audit_logs ORDER BY action",
    "SELECT DISTINCT entity FROM audit_logs ORDER BY entity",
  ]);
  return { actions: actions.rows.map((row) => String(row.action)), entities: entities.rows.map((row) => String(row.entity)) };
}
