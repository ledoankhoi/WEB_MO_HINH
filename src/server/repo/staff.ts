import "server-only";
import { isStaffRole, type StaffRole } from "@/lib/permissions";
import { getDb } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";

export type StaffMember = {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: number;
};

// shortcut: không phân trang, số nhân viên chỉ vài chục; phân trang nếu vượt vài trăm.
export async function listStaff(): Promise<StaffMember[]> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT id, email, name, role, is_active, created_at FROM users WHERE role <> 'customer' ORDER BY created_at, id",
  );
  return result.rows.flatMap((row) =>
    isStaffRole(row.role)
      ? [
          {
            id: String(row.id),
            email: String(row.email),
            name: String(row.name),
            role: row.role,
            isActive: row.is_active === true,
            createdAt: Number(row.created_at),
          },
        ]
      : [],
  );
}

export async function findStaffById(id: string): Promise<StaffMember | null> {
  return (await listStaff()).find((member) => member.id === id) ?? null;
}

// Ném lỗi ràng buộc (xem isConstraintError) nếu email đã được dùng.
export async function insertStaff(
  input: { email: string; name: string; role: StaffRole; passwordHash: string },
  entry: Omit<AuditEntry, "entityId">,
): Promise<string> {
  const db = await getDb();
  const id = newId();
  await db.batch([
    {
      sql: `INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, input.email, input.name, input.passwordHash, input.role, Date.now()],
    },
    auditStatement({ ...entry, entityId: id }),
  ]);
  return id;
}

// Đổi vai trò hoặc khoá, mở khoá một nhân viên theo các ràng buộc ở mục 3 của docs/chuan/10: không tự đổi
// chính mình, luôn còn ít nhất một admin đang hoạt động. Thay đổi được thì xoá mọi phiên của tài khoản đó,
// cùng giao dịch với nhật ký. Trả về false khi không đổi được dòng nào.
export async function updateStaff(
  actorId: string,
  userId: string,
  change: { role: StaffRole } | { isActive: boolean },
  entry: AuditEntry,
): Promise<boolean> {
  const [column, value] = "role" in change ? ["role", change.role] : ["is_active", change.isActive];
  const db = await getDb();
  const [, updated] = await db.batch([
    // Khoá các admin đang hoạt động: hai lần hạ quyền hai admin cuối cùng chạy song song thì lần sau phải
    // chờ, rồi thấy chỉ còn một admin và không đổi được.
    "SELECT id FROM users WHERE role = 'admin' AND is_active FOR UPDATE",
    withAudit(
      {
        sql: `UPDATE users SET ${column} = ?
              WHERE id = ? AND id <> ? AND role <> 'customer' AND ${column} <> ?
                AND (role <> 'admin' OR NOT is_active
                  OR EXISTS (SELECT 1 FROM users WHERE role = 'admin' AND is_active AND id <> ?))`,
        args: [value, userId, actorId, value, userId],
      },
      entry,
    ),
    // Câu trên bị từ chối thì giá trị cũ vẫn khác `value`, nên phiên được giữ nguyên.
    {
      sql: `DELETE FROM sessions WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND ${column} = ?)`,
      args: [userId, userId, value],
    },
  ]);
  return updated.rowsAffected > 0;
}
