"use client";

import { useState, useTransition } from "react";
import { AnimateIcon, Heart } from "@/components/animate/icons";
import { usePathname, useRouter } from "next/navigation";
import { setWishlistAction } from "@/app/actions/wishlist";
import { showToast } from "@/components/ui/Toaster";
import { getWishlistIds, setWishlistIds, useWishlistIds } from "./wishlist-store";

// Nút trái tim vuông viền đen (giao diện "Hộp mô hình"). Chưa đăng nhập thì chuyển tới trang đăng nhập.
export function WishlistButton({ productId, name, className = "" }: { productId: string; name: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useWishlistIds();
  const active = current?.has(productId) ?? false;
  const [pending, startTransition] = useTransition();
  // Trái tim nảy lên khi rê chuột và khi vừa thêm vào yêu thích.
  const [hovered, setHovered] = useState(false);
  const [popped, setPopped] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Bỏ ${name} khỏi yêu thích` : `Thêm ${name} vào yêu thích`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setWishlistAction(productId, !active);
          if (result.login) {
            router.push(`/dang-nhap?next=${encodeURIComponent(pathname)}`);
            return;
          }
          if (!result.ok) {
            showToast("Không cập nhật được danh sách yêu thích.", { tone: "error" });
            return;
          }
          const next = new Set(getWishlistIds());
          if (active) next.delete(productId);
          else {
            next.add(productId);
            setPopped(true);
            window.setTimeout(() => setPopped(false), 700);
          }
          setWishlistIds(next);
        })
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`inline-flex size-11 items-center justify-center border-2 border-ink bg-surface text-ink transition hover:bg-raised disabled:opacity-60 ${className}`}
    >
      <AnimateIcon animate={hovered || popped}>
        <Heart aria-hidden strokeWidth={2.4} className={`size-5 transition-colors ${active ? "fill-brand text-brand" : ""}`} />
      </AnimateIcon>
    </button>
  );
}
