import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/cart/CheckoutForm";
import { requireUser } from "@/server/auth/session";
import { listAddresses } from "@/server/repo/addresses";
import { getBankAccount, getPaymentMethods } from "@/server/payment";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Đặt hàng", robots: { index: false } };

// Phải đăng nhập mới đặt hàng (YC-GH-03): chưa đăng nhập thì sang /dang-nhap rồi quay lại đây (giỏ lưu ở trình duyệt nên
// không mất). Điền sẵn thông tin tài khoản: địa chỉ mặc định trong sổ địa chỉ, chọn được địa chỉ khác trong sổ.
async function Checkout() {
  const user = await requireUser("/thanh-toan");
  const addresses = await listAddresses(user.id);
  const saved = addresses.find((item) => item.isDefault) ?? null;
  return (
    <CheckoutForm
      paymentMethods={getPaymentMethods()}
      bankDemo={getBankAccount()?.demo ?? false}
      addresses={addresses}
      codOtp={{ from: site.codOtpFrom, verifiedEmail: user.emailVerified ? user.email : null }}
      defaults={{
        name: saved?.recipientName ?? user.name,
        phone: saved?.phone ?? user.phone ?? "",
        email: user.email,
        address: saved?.address ?? "",
        city: saved?.city ?? "",
      }}
    />
  );
}

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Đặt hàng</h1>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải...</p>}>
        <Checkout />
      </Suspense>
    </div>
  );
}
