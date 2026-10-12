import { Suspense } from "react";
import type { Metadata } from "next";
import { CheckoutForm } from "@/components/cart/CheckoutForm";
import { getCurrentUser } from "@/server/auth/session";
import { getPaymentMethods } from "@/server/payment";

export const metadata: Metadata = { title: "Đặt hàng", robots: { index: false } };

// Điền sẵn thông tin của tài khoản đang đăng nhập (nếu có). Khách vãng lai vẫn đặt hàng được.
async function Checkout() {
  const user = await getCurrentUser();
  return (
    <CheckoutForm
      paymentMethods={getPaymentMethods()}
      defaults={{
        name: user?.name ?? "",
        phone: user?.phone ?? "",
        email: user?.email ?? "",
        address: user?.address ?? "",
        city: user?.city ?? "",
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
