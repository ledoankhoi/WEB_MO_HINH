import Link from "next/link";
import { toggleHref, type ShopQuery } from "@/lib/shop-url";

// Hàng ngang trên cùng của khối "Tùy chọn sản phẩm" ở /san-pham: các danh mục đang có hàng, không có mục "Tất cả".
// Danh mục đang chọn chữ đỏ; bấm lại danh mục đó thì bỏ chọn (chữ đen) và trang hiện lại tất cả sản phẩm.
export function CategoryBar({
  current,
  categories,
  className = "",
}: {
  current: ShopQuery;
  categories: { slug: string; name: string; count: number }[];
  className?: string;
}) {
  return (
    <nav aria-label="Danh mục sản phẩm" className={`flex min-w-0 items-stretch overflow-x-auto lg:justify-between lg:px-1.5 ${className}`}>
      {categories.map((category) => {
        const selected = current.loai === category.slug;
        return (
          <Link
            key={category.slug}
            href={toggleHref(current, "loai", category.slug)}
            scroll={false}
            aria-current={selected ? "true" : undefined}
            title={selected ? `Bỏ chọn ${category.name}, hiện tất cả sản phẩm` : `Chỉ xem ${category.name}`}
            className={`inline-flex shrink-0 items-center gap-1 px-4 font-condensed text-[17px] font-extrabold tracking-[0.02em] whitespace-nowrap uppercase decoration-3 underline-offset-[6px] transition hover:underline lg:px-2 ${
              selected ? "text-brand" : "text-fg"
            }`}
          >
            {category.name}
            <span className={`text-[13px] font-bold ${selected ? "text-brand" : "text-muted"}`}>({category.count})</span>
          </Link>
        );
      })}
    </nav>
  );
}
