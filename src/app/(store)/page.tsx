import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductCard";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import { ButtonLink } from "@/components/ui/Button";
import { CATEGORIES } from "@/lib/catalog";
import { HeroBanner, StripBanners } from "@/components/content/Banners";
import { getActiveBanners, getCategoryCounts, getFeaturedProducts, getProductBySlug, searchProducts } from "@/server/catalog";

function SectionHeading({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
      <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-strong hover:underline">
        Xem tất cả <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

export default async function Home() {
  const [featured, newest, counts, banners] = await Promise.all([
    getFeaturedProducts(4),
    searchProducts({ q: "", category: "", sort: "moi-nhat", page: 1, pageSize: 8 }),
    getCategoryCounts(),
    getActiveBanners(),
  ]);
  // Không có banner thì trang chủ giữ nguyên như trước (YC-CMS-02).
  const heroBanner = banners.find((banner) => banner.placement === "home_hero");
  const stripBanners = banners.filter((banner) => banner.placement === "home_strip");
  const hero = featured[0] ? await getProductBySlug(featured[0].slug) : null;

  return (
    <>
      {heroBanner && (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
          <HeroBanner banner={heroBanner} />
        </div>
      )}
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <p className="text-xs font-semibold tracking-[0.2em] text-brand-strong uppercase">Mô hình robot sưu tầm</p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
              KHÁM PHÁ THẾ GIỚI ROBOT SƯU TẦM
            </h1>
            <p className="max-w-lg text-base text-muted sm:text-lg">
              Từ những huyền thoại biến hình đến các siêu robot hợp thể Nhật Bản — khám phá bộ sưu tập dành cho những
              người đam mê mô hình.
            </p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/san-pham" size="lg">
                Khám phá bộ sưu tập
              </ButtonLink>
              {hero && (
                <ButtonLink href={`/san-pham/${hero.slug}`} size="lg" variant="secondary">
                  Xem mô hình 3D
                </ButtonLink>
              )}
            </div>
          </div>
          {hero && (
            <div className="product-stage h-[380px] overflow-hidden rounded-2xl border border-line sm:h-[480px]">
              <RobotViewerLoader
                model={hero.model}
                colors={hero.colors}
                modelUrl={hero.modelUrl}
                label={`Mô hình 3D của ${hero.name}`}
              />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-14 sm:px-6">
        <StripBanners banners={stripBanners} />
        <section aria-labelledby="danh-muc">
          <h2 id="danh-muc" className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            Danh mục
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/san-pham?loai=${category.slug}`}
                  className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition hover:border-brand hover:shadow-lg hover:shadow-black/5"
                >
                  <span className="font-semibold">{category.name}</span>
                  <span className="text-sm text-muted">{category.description}</span>
                  <span className="mt-auto pt-2 text-xs text-muted">{counts[category.slug] ?? 0} sản phẩm</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeading title="Hàng mới về" href="/san-pham?sap-xep=moi-nhat" />
          <ProductGrid products={newest.items} />
        </section>

        <section>
          <SectionHeading title="Bộ sưu tập nổi bật" href="/san-pham?sap-xep=noi-bat" />
          <ProductGrid products={featured} />
        </section>
      </div>
    </>
  );
}
