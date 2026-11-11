"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Chip = { slug: string; name: string };

const CHIP = "inline-flex h-10 shrink-0 items-center border-2 border-ink bg-surface px-3.5 font-condensed text-base font-extrabold uppercase";

function Chips({ categories }: { categories: Chip[] }) {
  return (
    <nav aria-label="Danh mục" className="flex gap-2 overflow-x-auto border-b-3 border-ink bg-surface px-4 py-3 lg:hidden">
      <Link href="/san-pham" className={CHIP}>
        Tất cả
      </Link>
      {categories.map((category) => (
        <Link key={category.slug} href={`/san-pham?loai=${category.slug}`} className={CHIP}>
          {category.name}
        </Link>
      ))}
    </nav>
  );
}

// Dải danh mục vuốt ngang dưới đầu trang trên điện thoại, dẫn vào trang cửa hàng. Trang cửa hàng /san-pham đã có hàng
// danh mục riêng (khối "Tùy chọn sản phẩm") nên ẩn dải này. Đọc đường dẫn nên đặt dưới <Suspense> với
// MobileCategoryChipsFallback.
export function MobileCategoryChips({ categories }: { categories: Chip[] }) {
  const pathname = usePathname();
  if (pathname === "/san-pham") return null;
  return <Chips categories={categories} />;
}

export function MobileCategoryChipsFallback({ categories }: { categories: Chip[] }) {
  return <Chips categories={categories} />;
}
