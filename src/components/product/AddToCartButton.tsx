"use client";

import { useRouter } from "next/navigation";
import { AnimateIcon, Plus, ShoppingCart } from "@/components/animate/icons";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";
import { cart } from "@/lib/cart";

type Props = {
  id: string;
  name: string;
  stock: number;
  quantity?: number;
  size?: "sm" | "lg";
  full?: boolean;
  // Nút tròn chỉ có biểu tượng.
  compact?: boolean;
  // Thanh đen phủ hết chiều ngang, dùng trong thẻ sản phẩm (giao diện "Hộp mô hình").
  bar?: boolean;
  label?: string;
  // Hàng đặt trước: `stock` là số suất còn đặt được, lời báo ghi rõ là đặt trước.
  preorder?: boolean;
};

// Thêm vào giỏ; trả về true nếu thêm được.
function addToCart(id: string, name: string, stock: number, quantity: number, preorder = false): boolean {
  const added = cart.add(id, quantity, stock);
  if (added > 0) {
    showToast(preorder ? `Đã thêm ${name} (đặt trước) vào giỏ hàng.` : `Đã thêm ${name} vào giỏ hàng.`, { action: { href: "/gio-hang", label: "Xem giỏ" } });
    return true;
  }
  showToast("Giỏ hàng đã có số lượng tối đa có thể mua của sản phẩm này.", { tone: "error" });
  return false;
}

export function AddToCartButton({ id, name, stock, quantity = 1, size = "sm", full = false, compact = false, bar = false, label = "Thêm vào giỏ hàng", preorder = false }: Props) {
  const add = () => addToCart(id, name, stock, quantity, preorder);
  const verb = preorder ? `Đặt trước ${name}` : `Thêm ${name} vào giỏ hàng`;
  const none = preorder ? `${name} đã hết suất đặt trước` : `${name} đã hết hàng`;
  if (bar) {
    return (
      <AnimateIcon animateOnHover asChild>
        <button
          type="button"
          disabled={stock <= 0}
          onClick={add}
          aria-label={stock <= 0 ? none : verb}
          className="inline-flex h-12 w-full items-center justify-center gap-2 bg-ink font-condensed text-[19px] font-extrabold text-white uppercase transition hover:bg-brand disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
        >
          <ShoppingCart className="size-5" aria-hidden />
          {label}
        </button>
      </AnimateIcon>
    );
  }

  if (compact) {
    return (
      <AnimateIcon animateOnHover asChild>
        <button
          type="button"
          disabled={stock <= 0}
          onClick={add}
          aria-label={stock <= 0 ? none : verb}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-ink transition hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
        >
          <Plus className="size-5" strokeWidth={2.4} aria-hidden />
        </button>
      </AnimateIcon>
    );
  }

  if (stock <= 0) {
    return (
      <Button variant="secondary" size={size} full={full} disabled>
        {preorder ? "Hết suất đặt trước" : "Hết hàng"}
      </Button>
    );
  }

  // Rê chuột vào nút thì xe đẩy trong nút chạy hiệu ứng.
  return (
    <AnimateIcon animateOnHover className={full ? "block w-full" : "inline-flex"}>
      <Button size={size} full={full} onClick={add}>
        <ShoppingCart className="size-4" aria-hidden />
        {label}
      </Button>
    </AnimateIcon>
  );
}

// Thêm vào giỏ rồi đi thẳng tới trang đặt hàng.
export function BuyNowButton({ id, stock, quantity = 1, label = "Mua ngay" }: { id: string; stock: number; quantity?: number; label?: string }) {
  const router = useRouter();
  if (stock <= 0) return null;
  return (
    <button
      type="button"
      onClick={() => {
        // Đã có đủ số lượng trong giỏ thì vẫn sang trang đặt hàng.
        cart.add(id, quantity, stock);
        router.push("/thanh-toan");
      }}
      className="inline-flex h-12 w-full items-center justify-center rounded-full bg-fg px-7 text-base font-semibold text-bg transition hover:bg-fg/85"
    >
      {label}
    </button>
  );
}
