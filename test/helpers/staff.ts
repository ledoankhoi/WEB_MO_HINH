import type { Role } from "@/lib/permissions";

// Cookie của yêu cầu giả lập; test file tự vi.mock("next/headers") đọc từ đây (xem test/warehouse.test.ts).
export const jar = new Map<string, string>();

export async function createUser(role: Role, password = "mat-khau-dung") {
  const { getDb } = await import("@/server/db");
  const { newId } = await import("@/server/ids");
  const { hashPassword } = await import("@/server/auth/password");
  const db = await getDb();
  const id = newId();
  const email = `${role}-${id}@example.com`;
  await db.execute({
    sql: "INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [id, email, role, await hashPassword(password), role, Date.now()],
  });
  return { id, email };
}

// Đăng nhập quản trị bằng cách đặt thẳng cookie rs_admin, như máy chủ làm sau khi xác minh mật khẩu.
export async function signInAs(userId: string) {
  const { getDb } = await import("@/server/db");
  const { newToken, sha256 } = await import("@/server/ids");
  const db = await getDb();
  const token = newToken();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sha256(token), userId, Date.now() + 60_000, Date.now()],
  });
  jar.set("rs_admin", token);
}

export const formOf = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};
