import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { PRODUCTS_TAG } from "@/server/catalog";
import { expireUnpaidOrders, remindUnpaidTransfers } from "@/server/repo/bank-transfers";
import { reconcilePendingVnpay } from "@/server/payments/vnpay-ops";

// Việc định kỳ của cửa hàng, gọi bởi netlify/functions/dinh-ky.mts (15 phút một lần):
// 1. đối soát lượt VNPay treo (trước, để đơn vừa trả xong không bị huỷ nhầm);
// 2. nhắc khách chưa chuyển khoản; 3. tự huỷ đơn quá hạn trả trước, trả hàng về kho.
// Bảo vệ bằng CRON_SECRET (header Authorization: Bearer ...); thiếu biến thì route trả 404.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });
  const now = Date.now();
  const vnpay = await reconcilePendingVnpay(now);
  const reminded = await remindUnpaidTransfers(now);
  const expired = await expireUnpaidOrders(now);
  // Huỷ đơn trả hàng giữ về kho: số có thể bán trên trang sản phẩm đổi.
  if (expired.length > 0) revalidateTag(PRODUCTS_TAG, "max");
  return Response.json({ vnpay, reminded, expired });
}
