import { redirect } from "next/navigation";
import { handleReturn } from "@/server/payments/vnpay-settle";
import { getClientIp } from "@/server/request";

// Khách quay về từ VNPay (vnp_ReturnUrl). Chuyển tới trang đơn kèm kết quả để hiển thị.
export async function GET(request: Request) {
  const outcome = await handleReturn(new URL(request.url), await getClientIp());
  if (!outcome.token) redirect("/");
  const query = new URLSearchParams({ "thanh-toan": outcome.status });
  if (outcome.responseCode) query.set("ma", outcome.responseCode);
  redirect(`/don-hang/${outcome.token}?${query}`);
}
