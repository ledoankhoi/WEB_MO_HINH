import { handleIpn } from "@/server/payments/vnpay-settle";

// IPN của VNPay (máy chủ VNPay gọi, GET, có SSL). Đăng ký URL này với VNPay: https://<tên miền>/api/thanh-toan/vnpay/ipn.
// Luôn trả HTTP 200 với {RspCode, Message}; VNPay gọi lại tối đa 10 lần khi RspCode khác 00/02.
export async function GET(request: Request) {
  return Response.json(await handleIpn(new URL(request.url)));
}
