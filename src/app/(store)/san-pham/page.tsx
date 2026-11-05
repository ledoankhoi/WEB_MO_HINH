import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductCard";
import { ShopFilters } from "@/components/product/ShopFilters";
import { SortSelect } from "@/components/product/SortSelect";
import { buttonClass } from "@/components/ui/Button";
import { site } from "@/config/site";
import { CATEGORIES, isCategorySlug, isSortValue } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { getFilterOptions, searchProducts } from "@/server/catalog";

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

  const options = await getFilterOptions();
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
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, trang: "", ...changes })) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/san-pham?${query}` : "/san-pham";
  };

  // Bộ lọc đang bật, bấm để bỏ từng cái.
  const active = [
    q && { label: `“${q}”`, href: href({ q: "" }) },
    categoryInfo && { label: categoryInfo.name, href: href({ loai: "" }) },
    (minPrice !== undefined || maxPrice !== undefined) && {
      label: `${minPrice !== undefined ? formatVnd(minPrice) : "0 ₫"} – ${maxPrice !== undefined ? formatVnd(maxPrice) : "không giới hạn"}`,
      href: href({ "gia-tu": "", "gia-den": "" }),
    },
    inStock && { label: "Còn hàng", href: href({ "con-hang": "" }) },
    transformable && { label: "Có biến hình 3D", href: href({ "bien-hinh": "" }) },
    brand && { label: options.brands.find((b) => b.slug === brand)!.name, href: href({ "thuong-hieu": "" }) },
    series && { label: options.series.find((s) => s.slug === series)!.name, href: href({ series: "" }) },
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return (
    <>
      <div className="space-y-1">
        <nav aria-label="Đường dẫn" className="text-sm text-muted">
          <Link href="/" className="hover:text-fg">
            Trang chủ
          </Link>
          {" / "}
          <Link href="/san-pham" className="hover:text-fg">
            Cửa hàng
          </Link>
          {categoryInfo && <span className="text-fg">{` / ${categoryInfo.name}`}</span>}
        </nav>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{categoryInfo?.name ?? (q ? `Kết quả cho “${q}”` : "Cửa hàng")}</h1>
        <p className="text-muted">{categoryInfo?.description ?? "Toàn bộ mô hình robot sưu tầm, xem và xoay 3D trước khi mua."}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <ShopFilters
          key={JSON.stringify(current)}
          values={{ q, sort: current["sap-xep"], category, minPrice: current["gia-tu"], maxPrice: current["gia-den"], inStock, transformable, brand, series }}
          categories={CATEGORIES.map((c) => ({ slug: c.slug, name: c.name }))}
          brands={options.brands}
          series={options.series}
          priceMin={options.priceMin}
          priceMax={options.priceMax}
          activeCount={active.length - (q ? 1 : 0)}
        />

        <div className="min-w-0 flex-1 space-y-5">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface py-2.5 pr-3 pl-4">
            <p className="mr-auto text-sm text-muted" role="status">
              <b className="text-fg">{total}</b> sản phẩm
            </p>
            {active.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 py-1.5 pr-2.5 pl-3 text-sm font-semibold text-brand-ink transition hover:bg-brand/20"
                aria-label={`Bỏ lọc ${item.label}`}
              >
                {item.label}
                <X className="size-3.5" aria-hidden />
              </Link>
            ))}
            <SortSelect value={sort} />
          </div>

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
      </div>
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
