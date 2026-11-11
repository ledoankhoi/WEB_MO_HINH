import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Cổng VNPay, API 2.1.0 (sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html). Chỉ chạy ở máy chủ: khoá bí mật
// không bao giờ tới trình duyệt.
// Biến môi trường: VNPAY_TMN_CODE, VNPAY_HASH_SECRET (bắt buộc); VNPAY_PAY_URL, VNPAY_API_URL (mặc định sandbox).
// Chưa cấu hình thì trang thanh toán không hiện lựa chọn VNPay.

export const SANDBOX_PAY_URL = "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
export const SANDBOX_API_URL = "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
export const PAYMENT_TTL_MINUTES = 15;

export type VnpayConfig = { tmnCode: string; hashSecret: string; payUrl: string; apiUrl: string; sandbox: boolean };

export function vnpayConfig(env: Record<string, string | undefined> = process.env): VnpayConfig | null {
  const tmnCode = env.VNPAY_TMN_CODE?.trim() ?? "";
  const hashSecret = env.VNPAY_HASH_SECRET?.trim() ?? "";
  if (!/^[A-Z0-9]{8}$/i.test(tmnCode) || hashSecret.length < 16) return null;
  const payUrl = env.VNPAY_PAY_URL?.trim() || SANDBOX_PAY_URL;
  const apiUrl = env.VNPAY_API_URL?.trim() || SANDBOX_API_URL;
  return { tmnCode, hashSecret, payUrl, apiUrl, sandbox: payUrl === SANDBOX_PAY_URL };
}

// Mã hoá giống urlencode của PHP (mẫu chính thức): khoảng trắng thành "+", mã hoá cả ! ' ( ) * ~.
export function phpUrlencode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

// Chuỗi ký: các tham số vnp_* (trừ vnp_SecureHash, vnp_SecureHashType, giá trị rỗng) sắp xếp theo tên, mã hoá, nối "&".
export function hashData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key.startsWith("vnp_") && key !== "vnp_SecureHash" && key !== "vnp_SecureHashType" && params[key] !== "")
    .sort()
    .map((key) => `${phpUrlencode(key)}=${phpUrlencode(params[key])}`)
    .join("&");
}

export const hmacSha512 = (secret: string, data: string) => createHmac("sha512", secret).update(data, "utf8").digest("hex");

export function sign(params: Record<string, string>, secret: string): string {
  return hmacSha512(secret, hashData(params));
}

// Kiểm chữ ký trên các tham số VNPay gửi về (trả về hoặc IPN). So sánh thời gian hằng.
export function verifySignature(params: Record<string, string>, secret: string): boolean {
  const given = (params.vnp_SecureHash ?? "").toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(given)) return false;
  const expected = sign(params, secret);
  return timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

// yyyyMMddHHmmss theo giờ Việt Nam (GMT+7), như VNPay yêu cầu.
export function vnpDate(ms: number): string {
  return new Date(ms + 7 * 60 * 60 * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

// vnp_OrderInfo: tiếng Việt không dấu, không ký tự đặc biệt.
export function plainInfo(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

export type PaymentRequest = { ref: string; amount: number; orderInfo: string; ipAddr: string; returnUrl: string; now: number };

export function buildPaymentUrl(config: VnpayConfig, request: PaymentRequest): string {
  const params: Record<string, string> = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(request.amount * 100),
    vnp_CurrCode: "VND",
    vnp_TxnRef: request.ref,
    vnp_OrderInfo: plainInfo(request.orderInfo),
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: request.returnUrl,
    vnp_IpAddr: request.ipAddr || "127.0.0.1",
    vnp_CreateDate: vnpDate(request.now),
    vnp_ExpireDate: vnpDate(request.now + PAYMENT_TTL_MINUTES * 60 * 1000),
  };
  return `${config.payUrl}?${hashData(params)}&vnp_SecureHash=${sign(params, config.hashSecret)}`;
}

// Kết quả đọc từ tham số trả về / IPN (đã kiểm chữ ký ở tầng gọi).
export type VnpayResult = {
  ref: string;
  amount: number;
  success: boolean;
  responseCode: string;
  transactionStatus: string;
  transactionNo: string;
  bankCode: string;
  payDate: string;
};

export function readResult(params: Record<string, string>): VnpayResult {
  const responseCode = params.vnp_ResponseCode ?? "";
  const transactionStatus = params.vnp_TransactionStatus ?? "";
  return {
    ref: params.vnp_TxnRef ?? "",
    amount: Math.round(Number(params.vnp_Amount ?? 0) / 100),
    success: responseCode === "00" && transactionStatus === "00",
    responseCode,
    transactionStatus,
    transactionNo: params.vnp_TransactionNo ?? "",
    bankCode: params.vnp_BankCode ?? "",
    payDate: params.vnp_PayDate ?? "",
  };
}

// Thông báo cho khách theo vnp_ResponseCode (bảng mã lỗi của VNPay).
export const RESPONSE_MESSAGES: Record<string, string> = {
  "00": "Giao dịch thành công.",
  "07": "Đã trừ tiền nhưng giao dịch đang bị nghi ngờ; cửa hàng sẽ kiểm tra.",
  "09": "Thẻ hoặc tài khoản chưa đăng ký Internet Banking.",
  "10": "Xác thực thông tin thẻ sai quá 3 lần.",
  "11": "Đã hết hạn chờ thanh toán.",
  "12": "Thẻ hoặc tài khoản bị khoá.",
  "13": "Sai mật khẩu xác thực (OTP).",
  "24": "Bạn đã huỷ giao dịch.",
  "51": "Tài khoản không đủ số dư.",
  "65": "Vượt hạn mức giao dịch trong ngày.",
  "75": "Ngân hàng đang bảo trì.",
  "79": "Nhập sai mật khẩu thanh toán quá số lần quy định.",
  "99": "Lỗi không xác định.",
};

// Tra cứu giao dịch (querydr), gọi máy chủ ↔ máy chủ qua HTTPS. Dùng khi khách quay về mà IPN chưa tới (ví dụ chạy
// trên máy, VNPay không gọi được localhost) và để đối soát lượt treo. Trả null khi gọi lỗi.
export async function queryTransaction(
  config: VnpayConfig,
  query: { ref: string; createdAt: number; ipAddr: string; now: number; requestId: string },
  fetcher: typeof fetch = fetch,
): Promise<{ responseCode: string; transactionStatus: string; amount: number; transactionNo: string; bankCode: string } | null> {
  const body: Record<string, string> = {
    vnp_RequestId: query.requestId,
    vnp_Version: "2.1.0",
    vnp_Command: "querydr",
    vnp_TmnCode: config.tmnCode,
    vnp_TxnRef: query.ref,
    vnp_OrderInfo: plainInfo(`Tra cuu ${query.ref}`),
    vnp_TransactionDate: vnpDate(query.createdAt),
    vnp_CreateDate: vnpDate(query.now),
    vnp_IpAddr: query.ipAddr || "127.0.0.1",
  };
  const data = [body.vnp_RequestId, body.vnp_Version, body.vnp_Command, body.vnp_TmnCode, body.vnp_TxnRef, body.vnp_TransactionDate, body.vnp_CreateDate, body.vnp_IpAddr, body.vnp_OrderInfo].join("|");
  body.vnp_SecureHash = hmacSha512(config.hashSecret, data);
  try {
    const response = await fetcher(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    const text = (key: string) => (typeof json[key] === "string" || typeof json[key] === "number" ? String(json[key]) : "");
    // Đối chiếu đúng giao dịch và đúng cửa hàng; phản hồi đi qua HTTPS tới máy chủ VNPay.
    if (text("vnp_TxnRef") && text("vnp_TxnRef") !== query.ref) return null;
    return {
      responseCode: text("vnp_ResponseCode"),
      transactionStatus: text("vnp_TransactionStatus"),
      amount: Math.round(Number(text("vnp_Amount") || 0) / 100),
      transactionNo: text("vnp_TransactionNo"),
      bankCode: text("vnp_BankCode"),
    };
  } catch {
    return null;
  }
}

// Mã lỗi riêng của API hoàn tiền (bảng mã lỗi VNPay), để báo cho kế toán.
export const REFUND_MESSAGES: Record<string, string> = {
  "00": "Hoàn tiền thành công.",
  "02": "Tổng tiền hoàn vượt số tiền giao dịch gốc.",
  "03": "Dữ liệu gửi sang không đúng định dạng.",
  "04": "Không được hoàn toàn phần sau khi đã hoàn một phần.",
  "13": "Giao dịch này chỉ được hoàn một phần.",
  "91": "Không tìm thấy giao dịch cần hoàn.",
  "93": "Số tiền hoàn không hợp lệ.",
  "94": "Yêu cầu trùng: đã gửi yêu cầu hoàn trong 5 phút trước.",
  "95": "VNPay từ chối xử lý yêu cầu hoàn.",
  "97": "Sai chữ ký.",
  "98": "Quá thời gian xử lý, hãy tra cứu lại trước khi gửi lần nữa.",
  "99": "Lỗi không xác định.",
};

// Hoàn tiền một giao dịch (refund): "02" toàn phần, "03" một phần (số tiền ≤ giao dịch gốc). Gọi máy chủ ↔ máy chủ.
// `transactionDate`: lúc tạo lượt thanh toán (vnp_CreateDate của giao dịch gốc). Trả null khi không gọi được.
export async function refundTransaction(
  config: VnpayConfig,
  refund: { ref: string; amount: number; full: boolean; transactionNo: string; transactionDate: number; createBy: string; ipAddr: string; now: number; requestId: string },
  fetcher: typeof fetch = fetch,
): Promise<{ responseCode: string; message: string; transactionNo: string } | null> {
  const body: Record<string, string> = {
    vnp_RequestId: refund.requestId,
    vnp_Version: "2.1.0",
    vnp_Command: "refund",
    vnp_TmnCode: config.tmnCode,
    vnp_TransactionType: refund.full ? "02" : "03",
    vnp_TxnRef: refund.ref,
    vnp_Amount: String(refund.amount * 100),
    vnp_OrderInfo: plainInfo(`Hoan tien ${refund.ref}`),
    vnp_TransactionNo: refund.transactionNo,
    vnp_TransactionDate: vnpDate(refund.transactionDate),
    vnp_CreateBy: plainInfo(refund.createBy).slice(0, 250) || "admin",
    vnp_CreateDate: vnpDate(refund.now),
    vnp_IpAddr: refund.ipAddr || "127.0.0.1",
  };
  const data = [
    body.vnp_RequestId, body.vnp_Version, body.vnp_Command, body.vnp_TmnCode, body.vnp_TransactionType, body.vnp_TxnRef, body.vnp_Amount,
    body.vnp_TransactionNo, body.vnp_TransactionDate, body.vnp_CreateBy, body.vnp_CreateDate, body.vnp_IpAddr, body.vnp_OrderInfo,
  ].join("|");
  body.vnp_SecureHash = hmacSha512(config.hashSecret, data);
  try {
    const response = await fetcher(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const json = (await response.json()) as Record<string, unknown>;
    const text = (key: string) => (typeof json[key] === "string" || typeof json[key] === "number" ? String(json[key]) : "");
    if (text("vnp_TxnRef") && text("vnp_TxnRef") !== refund.ref) return null;
    const responseCode = text("vnp_ResponseCode");
    return { responseCode, message: REFUND_MESSAGES[responseCode] ?? (text("vnp_Message") || "Lỗi không xác định."), transactionNo: text("vnp_TransactionNo") };
  } catch {
    return null;
  }
}
