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
