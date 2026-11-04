"use client";

import { formatVnd } from "@/lib/format";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";

// Thanh mua hàng dính dưới đáy màn hình điện thoại (màn hình rộng đã có hộp mua bên phải). Thêm biến thể
// mặc định; chọn phiên bản khác thì dùng hộp mua trong trang.
export function MobileBuyBar({ productId, variantId, name, price, stock }: { productId: string; variantId: string; name: string; price: number; stock: number }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(25_26_28/0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="text-xs text-muted">Giá</p>
          <p className="text-lg font-extrabold tabular-nums">{formatVnd(price)}</p>
        </div>
        <WishlistButton productId={productId} name={name} className="size-12 shrink-0" />
        <AddToCartButton id={variantId} name={name} stock={stock} size="lg" label="Thêm vào giỏ" />
      </div>
    </div>
  );
}
