"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { compare, compareHref } from "@/lib/compare";

// Bỏ một sản phẩm khỏi bảng so sánh: cập nhật danh sách ở trình duyệt và đường dẫn của trang.
export function CompareRemove({ slug, slugs, name }: { slug: string; slugs: string[]; name: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        compare.toggle(slug);
        const rest = slugs.filter((item) => item !== slug);
        router.replace(rest.length > 0 ? compareHref(rest) : "/so-sanh");
      }}
      aria-label={`Bỏ ${name} khỏi so sánh`}
      className="rounded p-1 text-muted hover:text-fg"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

// Trang so sánh mở không kèm danh sách: lấy danh sách đã chọn ở trình duyệt.
export function CompareFromStorage({ slugs }: { slugs: readonly string[] }) {
  const router = useRouter();
  if (slugs.length === 0) return null;
  return (
    <button type="button" onClick={() => router.replace(compareHref(slugs))} className="font-semibold text-brand-strong underline">
      Mở {slugs.length} sản phẩm đã chọn
    </button>
  );
}
