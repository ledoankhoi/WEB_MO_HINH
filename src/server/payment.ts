import "server-only";
import type { PaymentMethod } from "@/lib/catalog";
import { vnpayConfig } from "./payments/vnpay";

export type BankAccount = {
  bin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  // BANK_DEMO=1: tài khoản minh hoạ (chạy thử, không bán thật). Trang đơn và trang thanh toán ghi rõ để khách không
  // chuyển tiền thật; nên dùng số tài khoản không tồn tại (ví dụ 0000000000) để quét mã cũng không chuyển nhầm được.
  demo: boolean;
};

// Tài khoản nhận chuyển khoản lấy từ biến môi trường. Thiếu hoặc sai định dạng thì coi như chưa cấu hình
// và cửa hàng chỉ nhận thanh toán khi nhận hàng.
export function getBankAccount(): BankAccount | null {
  const bin = process.env.BANK_BIN?.trim() ?? "";
  const bankName = process.env.BANK_NAME?.trim() ?? "";
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.replace(/\s+/g, "") ?? "";
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim() ?? "";

  if (!/^\d{6}$/.test(bin) || !/^[A-Za-z0-9]{4,19}$/.test(accountNumber) || !bankName || !accountName) return null;
  return { bin, bankName, accountNumber, accountName, demo: process.env.BANK_DEMO?.trim() === "1" };
}

// VNPay hiện khi có VNPAY_TMN_CODE, VNPAY_HASH_SECRET (sandbox hoặc thật, xem src/server/payments/vnpay.ts).
export function getPaymentMethods(): PaymentMethod[] {
  const methods: PaymentMethod[] = ["cod"];
  if (getBankAccount()) methods.push("bank");
  if (vnpayConfig()) methods.push("vnpay");
  return methods;
}
