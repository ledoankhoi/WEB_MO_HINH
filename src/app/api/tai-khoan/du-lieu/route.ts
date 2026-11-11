import { getCurrentUser } from "@/server/auth/session";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { exportAccountData } from "@/server/repo/users";

// Tải dữ liệu cá nhân (Cài đặt > Quyền riêng tư): GET /api/tai-khoan/du-lieu trả file JSON gồm hồ sơ, sổ địa chỉ, đơn
// hàng, đánh giá, yêu thích, yêu cầu báo có hàng của chính tài khoản đang đăng nhập. Không có mật khẩu, mã phiên.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ message: "Bạn cần đăng nhập." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const limit = await consumeRateLimit(`export-data:${user.id}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) {
    return Response.json({ message: "Bạn đã tải quá nhiều lần, vui lòng thử lại sau." }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }

  const data = await exportAccountData(user.id);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), store: "ROBOTICA", ...data }, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="robotica-du-lieu-ca-nhan.json"`,
      "Cache-Control": "no-store",
    },
  });
}
