import { timingSafeEqual } from "node:crypto";
import { reconcilePendingVnpay } from "@/server/payments/vnpay-ops";

// Đối soát lượt VNPay treo, gọi định kỳ bởi netlify/functions/vnpay-doi-soat.mts (15 phút một lần).
// Bảo vệ bằng CRON_SECRET (header Authorization: Bearer ...); thiếu biến thì route tắt.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json(await reconcilePendingVnpay(Date.now()));
}
