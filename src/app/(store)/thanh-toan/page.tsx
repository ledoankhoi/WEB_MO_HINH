import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/cart/CheckoutForm";
import { getCurrentUser } from "@/server/auth/session";
import { listAddresses } from "@/server/repo/addresses";
import { getPaymentMethods } from "@/server/payment";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Đặt hàng", robots: { index: false } };

// Điền sẵn thông tin của tài khoản đang đăng nhập (nếu có): địa chỉ mặc định trong sổ địa chỉ, chọn được địa chỉ
// khác trong sổ. Khách vãng lai vẫn đặt hàng được.
async function Checkout() {
  const user = await getCurrentUser();
  const addresses = user ? await listAddresses(user.id) : [];
  const saved = addresses.find((item) => item.isDefault) ?? null;
  return (
    <CheckoutForm
      paymentMethods={getPaymentMethods()}
      addresses={addresses}
      codOtp={{ from: site.codOtpFrom, verifiedEmail: user?.emailVerified ? user.email : null }}
      defaults={{
        name: saved?.recipientName ?? user?.name ?? "",
        phone: saved?.phone ?? user?.phone ?? "",
        email: user?.email ?? "",
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
