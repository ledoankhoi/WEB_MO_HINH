"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompare, X } from "lucide-react";
import { showToast } from "@/components/ui/Toaster";
import { COMPARE_MAX, compare, compareHref, useCompareList } from "@/lib/compare";

// Thêm sản phẩm vào danh sách so sánh (mục 19). Đủ COMPARE_MAX thì báo, không thêm.
export function CompareButton({ slug, name, className = "" }: { slug: string; name: string; className?: string }) {
  const list = useCompareList();
  const active = list.includes(slug);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        const result = compare.toggle(slug);
        if (result === "full") showToast(`Chỉ so sánh tối đa ${COMPARE_MAX} sản phẩm. Bỏ bớt rồi thêm lại.`, { tone: "error" });
        else if (result === "added") showToast(`Đã thêm ${name} vào so sánh.`, { action: { href: compareHref([...list, slug]), label: "So sánh" } });
      }}
      className={`inline-flex items-center gap-1.5 text-sm font-semibold transition hover:text-brand ${active ? "text-brand" : "text-muted"} ${className}`}
    >
      <GitCompare className="size-4" aria-hidden />
      {active ? "Đang so sánh" : "So sánh"}
    </button>
  );
}

// Thanh nổi khi đã chọn sản phẩm để so sánh (ẩn ở chính trang so sánh).
export function CompareBar() {
  const list = useCompareList();
  const pathname = usePathname();
  if (list.length === 0 || pathname === "/so-sanh") return null;
  return (
    <div className="fixed bottom-24 left-4 z-40 flex items-center gap-2 border-3 border-ink bg-surface px-3 py-2 shadow-[4px_4px_0_var(--color-ink)] lg:bottom-6">
      <Link href={compareHref(list)} className="font-condensed text-lg font-extrabold uppercase hover:text-brand">
        So sánh ({list.length}/{COMPARE_MAX})
      </Link>
      <button type="button" onClick={() => compare.clear()} aria-label="Bỏ hết sản phẩm khỏi so sánh" className="rounded p-1 text-muted hover:text-fg">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
