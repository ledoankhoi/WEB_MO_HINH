// Hàm hẹn giờ của Netlify: 15 phút một lần gọi route đối soát lượt VNPay treo (src/app/api/thanh-toan/vnpay/doi-soat).
// Cần biến CRON_SECRET (giống nhau cho site và hàm) trên Netlify; URL là biến Netlify tự có (địa chỉ chính của site).
export default async function handler(): Promise<Response> {
  const base = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) return new Response("CRON_SECRET hoặc URL chưa đặt", { status: 200 });
  const response = await fetch(`${base}/api/thanh-toan/vnpay/doi-soat`, { headers: { Authorization: `Bearer ${secret}` } });
  return new Response(await response.text(), { status: 200 });
}

export const config = { schedule: "*/15 * * * *" };
