"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCartCount } from "@/lib/cart";

export function CartButton() {
  const count = useCartCount();
  return (
    <Link
      href="/gio-hang"
      className="relative grid size-10 place-items-center rounded-full text-fg transition hover:bg-raised hover:text-brand"
      aria-label={count > 0 ? `Giỏ hàng, ${count} sản phẩm` : "Giỏ hàng"}
    >
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-ink">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
