import { authorize } from "@/server/auth/session";
import { orderPulse } from "@/server/repo/orders";

// Thanh bên quản trị hỏi định kỳ (OrderAlerts): số đơn cần xử lý và đơn mới nhất, để hiện huy hiệu và báo
// đơn mới mà không cần tải lại trang. Nằm dưới /admin để trình duyệt gửi kèm cookie quản trị.
export async function GET() {
  const user = await authorize("orders.view");
  if (!user) return Response.json({ ok: false }, { status: 403 });
  return Response.json({ ok: true, ...(await orderPulse()) }, { headers: { "Cache-Control": "no-store" } });
}
