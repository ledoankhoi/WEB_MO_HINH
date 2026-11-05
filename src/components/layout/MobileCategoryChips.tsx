"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Chip = { slug: string; name: string };

const CHIP = "inline-flex h-10 shrink-0 items-center border-2 border-ink px-3.5 font-condensed text-base font-extrabold uppercase";

function Chips({ categories, current }: { categories: Chip[]; current: string | null }) {
  return (
    <nav aria-label="Danh mục" className="flex gap-2 overflow-x-auto border-b-3 border-ink bg-surface px-4 py-3 lg:hidden">
      <Link href="/san-pham" aria-current={current === "" ? "page" : undefined} className={`${CHIP} ${current === "" ? "bg-ink text-white" : "bg-surface"}`}>
        Tất cả
      </Link>
      {categories.map((category) => (
        <Link
          key={category.slug}
          href={`/san-pham?loai=${category.slug}`}
          aria-current={current === category.slug ? "page" : undefined}
          className={`${CHIP} ${current === category.slug ? "bg-ink text-white" : "bg-surface"}`}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}

// Dải danh mục vuốt ngang dưới đầu trang trên điện thoại. Đọc tham số URL nên đặt dưới <Suspense> với
// MobileCategoryChipsFallback.
export function MobileCategoryChips({ categories }: { categories: Chip[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = pathname === "/san-pham" ? (params.get("loai") ?? "") : null;
  return <Chips categories={categories} current={current} />;
}

export function MobileCategoryChipsFallback({ categories }: { categories: Chip[] }) {
  return <Chips categories={categories} current={null} />;
}
