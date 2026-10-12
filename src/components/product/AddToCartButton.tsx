"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";
import { cart } from "@/lib/cart";

export function AddToCartButton({
  id,
  name,
  stock,
  quantity = 1,
  size = "sm",
  full = false,
}: {
  id: string;
  name: string;
  stock: number;
  quantity?: number;
  size?: "sm" | "lg";
  full?: boolean;
}) {
  if (stock <= 0) {
    return (
      <Button variant="secondary" size={size} full={full} disabled>
        Hết hàng
      </Button>
    );
  }

  return (
    <Button
      size={size}
      full={full}
      onClick={() => {
        const added = cart.add(id, quantity, stock);
        if (added > 0) {
          showToast(`Đã thêm ${name} vào giỏ hàng.`, { action: { href: "/gio-hang", label: "Xem giỏ" } });
        } else {
          showToast("Giỏ hàng đã có số lượng tối đa có thể mua của sản phẩm này.", { tone: "error" });
        }
      }}
    >
      <ShoppingCart className="size-4" aria-hidden />
      Thêm vào giỏ hàng
    </Button>
  );
}
