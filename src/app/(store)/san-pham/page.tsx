import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { CategoryBar } from "@/components/product/CategoryBar";
import { OptionsColumn } from "@/components/product/OptionsColumn";
import { ProductGrid } from "@/components/product/ProductCard";
import { buttonClass } from "@/components/ui/Button";
import { site } from "@/config/site";
import { CATEGORIES, isCategorySlug, isSortValue } from "@/lib/catalog";
import { shopHref } from "@/lib/shop-url";
import { getCategoryCounts, getFilterOptions, searchProducts } from "@/server/catalog";

type SearchParams = PageProps<"/san-pham">["searchParams"];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

// YC-SP-09: trang lọc theo danh mục có tiêu đề và mô tả riêng.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const slug = first((await searchParams).loai);
  const category = CATEGORIES.find((item) => item.slug === slug);
  if (!category) return { title: "Cửa hàng", description: "Toàn bộ mô hình robot sưu tầm: tìm kiếm, lọc theo danh mục và sắp xếp theo giá." };
  return { title: category.name, description: category.description, alternates: { canonical: `/san-pham?loai=${category.slug}` } };
}

const pill = (active: boolean) =>
  `grid h-10 min-w-10 place-items-center rounded-full border px-3 text-sm font-medium transition ${
    active ? "border-fg bg-fg text-bg" : "border-line bg-surface text-fg hover:border-fg/30"
  }`;

// Giá nhập trên URL: số nguyên không âm, bỏ qua giá trị không hợp lệ.
const priceParam = (value: string) => {
  const number = Number.parseInt(value.replace(/\D/g, ""), 10);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 80);
  const category = isCategorySlug(first(params.loai)) ? first(params.loai) : "";
  const sortParam = first(params["sap-xep"]);
  const sort = isSortValue(sortParam) ? sortParam : "moi-nhat";
  const page = Math.min(Math.max(Number.parseInt(first(params.trang), 10) || 1, 1), 1000);
  const minPrice = priceParam(first(params["gia-tu"]));
  const maxPrice = priceParam(first(params["gia-den"]));
  const inStock = first(params["con-hang"]) === "1";
  const transformable = first(params["bien-hinh"]) === "1";

  const [options, counts] = await Promise.all([getFilterOptions(), getCategoryCounts()]);
  const brand = options.brands.some((b) => b.slug === first(params["thuong-hieu"])) ? first(params["thuong-hieu"]) : "";
  const series = options.series.some((s) => s.slug === first(params.series)) ? first(params.series) : "";

  const { items, total } = await searchProducts({ q, category, sort, page, pageSize: site.pageSize, minPrice, maxPrice, inStock, brand, series, transformable });
  const pages = Math.max(1, Math.ceil(total / site.pageSize));
  const categoryInfo = CATEGORIES.find((c) => c.slug === category);

  // Tạo liên kết giữ nguyên các bộ lọc khác; đổi bộ lọc thì quay về trang 1.
  const current: Record<string, string> = {
    q,
    loai: category,
    "gia-tu": minPrice === undefined ? "" : String(minPrice),
    "gia-den": maxPrice === undefined ? "" : String(maxPrice),
    "con-hang": inStock ? "1" : "",
    "bien-hinh": transformable ? "1" : "",
    "thuong-hieu": brand,
    series,
    "sap-xep": sort === "moi-nhat" ? "" : sort,
  };
  const href = (changes: Record<string, string>) => shopHref(current, changes);
  // Hàng danh mục: các danh mục đang có hàng (giữ danh mục đang chọn dù đã hết hàng để còn bỏ chọn được).
  const categoryTabs = CATEGORIES.filter((c) => (counts[c.slug] ?? 0) > 0 || c.slug === category).map((c) => ({
    slug: c.slug,
    name: c.name,
    count: counts[c.slug] ?? 0,
  }));

  return (
    <>
      {/* Không hiện tiêu đề trên trang (khối "Tùy chọn sản phẩm" đã cho biết đang xem gì); giữ thẻ h1 ẩn cho trình đọc
          màn hình và công cụ tìm kiếm. */}
      <h1 className="sr-only">{categoryInfo?.name ?? (q ? `Kết quả cho “${q}”` : "Cửa hàng")}</h1>

      {/* Khối "Tùy chọn sản phẩm" hình chữ Γ: góc đỏ trên bên trái, hàng danh mục nằm ngang, cột tuỳ chọn nằm dọc;
          lưới sản phẩm nằm trong góc còn lại. Trên điện thoại ba phần xếp chồng. */}
      <section aria-label="Tùy chọn sản phẩm" className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <p className="flex h-14 items-center gap-2 border-3 border-ink bg-brand px-4 font-condensed text-lg font-extrabold tracking-[0.04em] text-white uppercase">
          <SlidersHorizontal className="size-[18px]" strokeWidth={2.6} aria-hidden />
          Tùy chọn sản phẩm
        </p>
        <CategoryBar current={current} categories={categoryTabs} className="h-14 border-3 border-t-0 border-ink bg-surface lg:border-t-3 lg:border-l-0" />
        <OptionsColumn
          current={current}
          brands={options.brands}
          series={options.series}
          priceMin={options.priceMin}
          priceMax={options.priceMax}
          className="border-3 border-t-0 border-ink bg-surface"
        />

        <div className="mt-6 min-w-0 space-y-5 lg:mt-0 lg:pt-6 lg:pl-8">
          {items.length > 0 ? (
            <ProductGrid products={items} columns={3} />
          ) : (
            <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
              <p className="font-semibold">Không tìm thấy sản phẩm phù hợp</p>
              <p className="mt-1 text-sm text-muted">Hãy thử từ khoá khác hoặc bỏ bớt bộ lọc.</p>
              <Link href="/san-pham" className={`${buttonClass({ variant: "secondary", size: "sm" })} mt-5`}>
                Xem tất cả sản phẩm
              </Link>
            </div>
          )}

          {pages > 1 && (
            <nav aria-label="Phân trang" className="flex flex-wrap justify-center gap-2 pt-2">
              {page > 1 && (
                <Link href={href({ trang: page === 2 ? "" : String(page - 1) })} className={`${pill(false)} px-4`}>
                  ← Trang trước
                </Link>
              )}
              {Array.from({ length: pages }, (_, index) => index + 1).map((number) => (
                <Link
                  key={number}
                  href={href({ trang: number === 1 ? "" : String(number) })}
                  aria-current={number === page ? "page" : undefined}
                  className={pill(number === page)}
                >
                  {number}
                </Link>
              ))}
              {page < pages && (
                <Link href={href({ trang: String(page + 1) })} className={`${pill(false)} px-4`}>
                  Trang sau →
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}

export default function ShopPage({ searchParams }: PageProps<"/san-pham">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      {/* Tham số URL chỉ biết lúc có yêu cầu, nên phần kết quả nằm dưới Suspense. */}
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải sản phẩm...</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
