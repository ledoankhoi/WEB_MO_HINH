import { authorize } from "@/server/auth/session";
import { adminAlerts } from "@/server/repo/admin-alerts";

// Thanh bên quản trị hỏi định kỳ (AdminAlerts): số việc đang chờ theo từng loại và việc mới nhất, chỉ các loại
// vai trò này có quyền. Nằm dưới /admin để trình duyệt gửi kèm cookie quản trị.
export async function GET() {
  const user = await authorize("dashboard.view");
  if (!user) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, ...(await adminAlerts(user.role)) }, { headers: { "Cache-Control": "no-store" } });
}
