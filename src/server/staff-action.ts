import "server-only";
import type { Permission } from "@/lib/permissions";
import type { FormState } from "@/lib/types";
import { authorize } from "./auth/session";
import type { AuditEntry } from "./repo/audit";

// Dùng chung cho các file Server Action của khu quản trị. Không đặt trong file "use server" vì mọi hàm
// export ở đó đều thành action gọi được từ trình duyệt.

export const FORBIDDEN: FormState = { message: "Bạn không có quyền thực hiện thao tác này." };

export const isId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{20}$/.test(value);

// Kiểm tra phiên và quyền trước mọi thao tác; trả về hàm tạo dòng nhật ký mang người làm và vai trò.
export async function staffWith(permission: Permission) {
  const user = await authorize(permission);
  if (!user) return null;
  const audit = (entry: Omit<AuditEntry, "actor">): AuditEntry => ({ actor: { id: user.id, role: user.role }, ...entry });
  return Object.assign(audit, { user });
}

// Chỉ giữ các trường có đổi, dạng { before, after }.
export function changes(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Object.keys(after).filter((key) => before[key] !== after[key]);
  return {
    before: Object.fromEntries(keys.map((key) => [key, before[key]])),
    after: Object.fromEntries(keys.map((key) => [key, after[key]])),
  };
}
