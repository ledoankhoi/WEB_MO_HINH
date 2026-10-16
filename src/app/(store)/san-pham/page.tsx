import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductCard";
import { buttonClass } from "@/components/ui/Button";
import { site } from "@/config/site";
import { CATEGORIES, SORT_OPTIONS, isCategorySlug, isSortValue } from "@/lib/catalog";
import { searchProducts } from "@/server/catalog";

type SearchParams = PageProps<"/san-pham">["searchParams"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

// YC-SP-09: trang lọc theo danh mục có tiêu đề và mô tả riêng.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const slug = first((await searchParams).loai);
  const category = CATEGORIES.find((item) => item.slug === slug);
  if (!category) return { title: "Cửa hàng", description: "Toàn bộ mô hình robot sưu tầm: tìm kiếm, lọc theo danh mục và sắp xếp theo giá." };
  return { title: category.name, description: category.description, alternates: { canonical: `/san-pham?loai=${category.slug}` } };
}

const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
    active ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:border-fg/30 hover:text-fg"
  }`;

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const category = isCategorySlug(first(params.loai)) ? first(params.loai) : "";
  const sortParam = first(params["sap-xep"]);
  const sort = isSortValue(sortParam) ? sortParam : "moi-nhat";
  const page = Math.min(Math.max(Number.parseInt(first(params.trang), 10) || 1, 1), 1000);

  const { items, total } = await searchProducts({ q, category, sort, page, pageSize: site.pageSize });
  const pages = Math.max(1, Math.ceil(total / site.pageSize));

  // Tạo liên kết giữ nguyên các bộ lọc khác; đổi bộ lọc thì quay về trang 1.
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    const merged = { q, loai: category, "sap-xep": sort === "moi-nhat" ? "" : sort, trang: "", ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/san-pham?${query}` : "/san-pham";
  };
  const filtered = Boolean(q || category || sort !== "moi-nhat");

  return (
    <>
      <Form action="/san-pham" className="relative max-w-md" role="search">
        {category && <input type="hidden" name="loai" value={category} />}
        <label htmlFor="shop-search" className="sr-only">
          Tìm theo tên sản phẩm
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          id="shop-search"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={80}
          placeholder="Tìm theo tên sản phẩm..."
          className="h-11 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
        />
      </Form>

      <nav aria-label="Lọc theo danh mục" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ loai: "" })} className={chip(!category)}>
          Tất cả
        </Link>
        {CATEGORIES.map((c) => (
          <Link key={c.slug} href={href({ loai: c.slug })} className={chip(category === c.slug)}>
            {c.name}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <p className="text-muted" role="status">
          {total} sản phẩm{q ? ` cho “${q}”` : ""}
        </p>
        <nav aria-label="Sắp xếp" className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:ml-auto">
          <span className="text-muted">Sắp xếp:</span>
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={href({ "sap-xep": option.value === "moi-nhat" ? "" : option.value })}
              aria-current={sort === option.value ? "true" : undefined}
              className={sort === option.value ? "font-semibold text-fg underline underline-offset-4" : "text-muted hover:text-fg"}
            >
              {option.label}
            </Link>
          ))}
        </nav>
        {filtered && (
          <Link href="/san-pham" className="font-medium text-brand-strong hover:underline">
            Xoá bộ lọc
          </Link>
        )}
      </div>

      {items.length > 0 ? (
        <ProductGrid products={items} />
      ) : (
        <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
          <p className="font-semibold">Không tìm thấy sản phẩm phù hợp</p>
          <p className="mt-1 text-sm text-muted">Hãy thử từ khoá khác hoặc bỏ bớt bộ lọc.</p>
          <Link href="/san-pham" className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-5`}>
            Xem tất cả sản phẩm
          </Link>
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Phân trang" className="flex justify-center gap-2">
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={href({ trang: number === 1 ? "" : String(number) })}
              aria-current={number === page ? "page" : undefined}
              className={chip(number === page)}
            >
              {number}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

export default function ShopPage({ searchParams }: PageProps<"/san-pham">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Cửa hàng</h1>
      {/* Tham số URL chỉ biết lúc có yêu cầu, nên phần kết quả nằm dưới Suspense. */}
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải sản phẩm...</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
