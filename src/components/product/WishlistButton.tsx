"use client";

import { useSyncExternalStore, useTransition } from "react";
import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { setWishlistAction } from "@/app/actions/wishlist";
import { showToast } from "@/components/ui/Toaster";

// Danh sách yêu thích tải một lần cho cả trang (mọi nút dùng chung). null: chưa tải hoặc chưa đăng nhập.
let ids: ReadonlySet<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  loading ??= fetch("/api/wishlist", { cache: "no-store" })
    .then((response) => response.json() as Promise<{ ids: string[] | null }>)
    .then((body) => {
      ids = body.ids ? new Set(body.ids) : null;
      // Chưa đăng nhập: lần gắn nút sau (ví dụ sau khi đăng nhập) tải lại.
      if (!body.ids) loading = null;
      emit();
    })
    .catch(() => {});
  return () => listeners.delete(listener);
}

export function WishlistButton({ productId, name, className = "" }: { productId: string; name: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSyncExternalStore(subscribe, () => ids, () => null);
  const active = current?.has(productId) ?? false;
  const [pending, startTransition] = useTransition();

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
          const next = new Set(ids);
          if (active) next.delete(productId);
          else next.add(productId);
          ids = next;
          emit();
        })
      }
      className={`inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface transition hover:border-brand disabled:opacity-60 ${className}`}
    >
      <Heart aria-hidden className={`size-5 ${active ? "fill-danger text-danger" : "text-muted"}`} />
    </button>
  );
}
