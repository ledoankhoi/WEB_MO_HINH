import "server-only";
import type { PaymentMethod } from "@/lib/catalog";

export type BankAccount = {
  bin: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
};

// Tài khoản nhận chuyển khoản lấy từ biến môi trường. Thiếu hoặc sai định dạng thì coi như chưa cấu hình
// và cửa hàng chỉ nhận thanh toán khi nhận hàng.
export function getBankAccount(): BankAccount | null {
  const bin = process.env.BANK_BIN?.trim() ?? "";
  const bankName = process.env.BANK_NAME?.trim() ?? "";
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER?.replace(/\s+/g, "") ?? "";
  const accountName = process.env.BANK_ACCOUNT_NAME?.trim() ?? "";

  if (!/^\d{6}$/.test(bin) || !/^[A-Za-z0-9]{4,19}$/.test(accountNumber) || !bankName || !accountName) return null;
  return { bin, bankName, accountNumber, accountName };
}

export function getPaymentMethods(): PaymentMethod[] {
  return getBankAccount() ? ["cod", "bank"] : ["cod"];
}
