"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useWishlistIds } from "@/components/product/wishlist-store";

// Lối tắt tới danh sách yêu thích (trong trang tài khoản) kèm số sản phẩm. Chưa đăng nhập thì trang tài khoản tự
// chuyển tới đăng nhập.
export function WishlistLink() {
  const ids = useWishlistIds();
  const count = ids?.size ?? 0;
  return (
    <Link
      href="/tai-khoan#yeu-thich"
      aria-label={count > 0 ? `Yêu thích, ${count} sản phẩm` : "Yêu thích"}
      className="relative grid size-11 place-items-center border-3 border-ink bg-surface shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-raised lg:size-[52px] lg:shadow-[4px_4px_0_var(--color-ink)]"
    >
      <Heart className="size-[22px]" strokeWidth={2.4} aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-3 -right-3 grid h-6 min-w-6 place-items-center rounded-full border-2 border-ink bg-cobalt px-1.5 text-xs font-bold text-white tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
