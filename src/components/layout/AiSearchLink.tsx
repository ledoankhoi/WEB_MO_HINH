import Link from "next/link";
import { Sparkles } from "lucide-react";

// Nút AI ở cụm nút bên phải đầu trang (cạnh yêu thích, giỏ hàng): mở trang nhận dạng robot bằng ảnh.
// Thay cho nút "Bằng ảnh" trong ô tìm kiếm.
export function AiSearchLink() {
  return (
    <Link
      href="/tim-bang-anh"
      aria-label="Nhận dạng robot bằng ảnh (AI)"
      title="Nhận dạng robot bằng ảnh (AI)"
      className="relative grid size-11 place-items-center border-3 border-ink bg-surface shadow-[3px_3px_0_var(--color-ink)] transition hover:bg-raised lg:size-[52px] lg:shadow-[4px_4px_0_var(--color-ink)]"
    >
      <Sparkles className="size-[22px]" strokeWidth={2.4} aria-hidden />
      <span
        aria-hidden
        className="absolute -top-2.5 -right-2.5 rounded-full border-2 border-ink bg-cobalt px-1.5 font-condensed text-[11px] leading-4 font-black text-white"
      >
        AI
      </span>
    </Link>
  );
}
