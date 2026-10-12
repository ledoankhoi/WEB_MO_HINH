import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "Giỏ hàng", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Giỏ hàng</h1>
      <CartView />
    </div>
  );
}
