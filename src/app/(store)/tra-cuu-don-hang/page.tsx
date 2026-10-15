import type { Metadata } from "next";
import { LookupForm } from "./LookupForm";

export const metadata: Metadata = { title: "Tra cứu đơn hàng" };

export default function LookupPage() {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tra cứu đơn hàng</h1>
        <p className="text-sm text-muted">Nhập mã đơn hàng và số điện thoại đã dùng khi đặt.</p>
      </div>
      <LookupForm />
    </div>
  );
}
