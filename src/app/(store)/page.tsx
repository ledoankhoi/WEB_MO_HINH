import Link from "next/link";
import { ArrowRight, Camera, QrCode, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { HeroBanner, StripBanners } from "@/components/content/Banners";
import { ComboHero } from "@/components/home/ComboHero";
import { FlashSaleSection } from "@/components/home/FlashSaleSection";
import { ShelfTabs, type ShelfTab } from "@/components/home/ShelfTabs";
import { ProductGrid, ProductImage } from "@/components/product/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import { IMAGE_SEARCH_MODEL } from "@/lib/image-search";
import { MODEL_FEATURES } from "@/lib/model-features";
import { getActiveBanners, getFeaturedProducts, getMegaMenu, getProductBySlug, getSiteSettings, searchProducts } from "@/server/catalog";
import { getImageSearchStatus } from "@/server/image-search";
import { getBankAccount } from "@/server/payment";
import { SectionHeading } from "@/components/store/StoreKit";

// Bộ hợp thể đầu tiên đang bán (theo thứ tự trong MODEL_FEATURES) cho khối mở đầu trang chủ.
async function findCombiner() {
  for (const [slug, features] of Object.entries(MODEL_FEATURES)) {
    if (!features.members) continue;
    const product = await getProductBySlug(slug);
    if (!product) continue;
    const members = (await Promise.all(features.members.map((member) => getProductBySlug(member)))).filter((m) => m !== null);
    return { product, members };
  }
  return null;
}

// Màu dải tên của ô danh mục, lần lượt xanh coban, đỏ, đen.
const TILE_COLORS = ["bg-cobalt", "bg-brand", "bg-ink"];

export default async function Home() {
  const shelf = (filter: Partial<Parameters<typeof searchProducts>[0]>) =>
    searchProducts({ q: "", category: "", sort: "moi-nhat", page: 1, pageSize: 8, ...filter });
  const [combiner, featured, categories, banners, settings, imageSearchStatus, newest, transformable, underMillion, inStock] = await Promise.all([
    findCombiner(),
    getFeaturedProducts(8),
    getMegaMenu(),
    getActiveBanners(),
    getSiteSettings(),
    getImageSearchStatus(IMAGE_SEARCH_MODEL.id),
    shelf({}),
    shelf({ transformable: true }),
    shelf({ maxPrice: 999_999 }),
    shelf({ inStock: true }),
  ]);
  // Không có banner thì trang chủ giữ nguyên như trước (YC-CMS-02).
  const heroBanner = banners.find((banner) => banner.placement === "home_hero");
  const stripBanners = banners.filter((banner) => banner.placement === "home_strip");
  const heroProduct = combiner?.product ?? (featured[0] ? await getProductBySlug(featured[0].slug) : null);
  const policy = settings.policy ?? site.policy;
  const imageSearch = imageSearchStatus.products > 0;
  // Ví dụ minh hoạ trong dải "Tìm bằng ảnh": một mẫu biến hình được, không có thì mẫu nổi bật.
  const example = transformable.items[0] ?? featured[0];

  const tabs: ShelfTab[] = [
    { key: "tat-ca", label: "Tất cả", href: "/san-pham", items: newest.items },
    { key: "bien-hinh", label: "Có biến hình 3D", href: "/san-pham?bien-hinh=1", items: transformable.items },
    { key: "duoi-1-trieu", label: "Dưới 1 triệu", href: "/san-pham?gia-den=999999", items: underMillion.items },
    { key: "con-hang", label: "Còn hàng", href: "/san-pham?con-hang=1", items: inStock.items },
  ]
    .filter((tab) => tab.items.length > 0)
    .map(({ items, ...tab }) => ({ ...tab, content: <ProductGrid products={items} /> }));

  const perks = [
    { icon: Truck, text: `Giao miễn phí từ ${formatVnd(site.shipping.freeFrom)}` },
    { icon: RotateCcw, text: `Đổi trả ${policy.returnDays} ngày` },
    { icon: ShieldCheck, text: `Bảo hành ${policy.warrantyMonths} tháng` },
    { icon: QrCode, text: getBankAccount() ? "VietQR hoặc COD" : "Trả tiền khi nhận hàng" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-24 px-4 pt-8 sm:px-6 lg:pt-10">
      {heroBanner && <HeroBanner banner={heroBanner} />}
      {heroProduct ? (
        <ComboHero product={heroProduct} members={combiner?.members ?? []} />
      ) : (
        <section className="border-3 border-ink bg-cobalt p-10 text-white shadow-[10px_10px_0_var(--color-ink)]">
          <h1 className="font-condensed text-6xl font-black uppercase italic">Khám phá thế giới robot sưu tầm</h1>
          <ButtonLink href="/san-pham" variant="secondary" size="lg" className="mt-6">
            Khám phá bộ sưu tập
          </ButtonLink>
        </section>
      )}

      <StripBanners banners={stripBanners} />

      <FlashSaleSection />

      {categories.length > 0 && (
        <section aria-labelledby="danh-muc">
          <div className="mb-14 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <SectionHeading id="danh-muc" bar="bg-brand">
              Chọn dòng robot
            </SectionHeading>
            <Link href="/san-pham" className="border-b-3 border-ink font-condensed text-xl font-extrabold uppercase hover:text-brand">
              Tất cả sản phẩm
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-14 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category, index) => (
              <li key={category.slug}>
                <Link
                  href={`/san-pham?loai=${category.slug}`}
                  className="group flex h-full flex-col border-3 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)] transition hover:-translate-y-1"
                >
                  <span className="halftone grid h-36 place-items-center">
                    <ProductImage src={category.featured?.image ?? null} alt="" className="-mt-11 h-44 w-full p-1 transition duration-300 group-hover:scale-105" />
                  </span>
                  <span
                    className={`flex flex-1 items-center justify-between gap-2 border-t-3 border-ink px-3.5 py-3 font-condensed text-[21px] leading-[1.05] font-extrabold text-white uppercase ${TILE_COLORS[index % TILE_COLORS.length]}`}
                  >
                    {category.name}
                    <ArrowRight className="size-5 shrink-0" strokeWidth={2.6} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tabs.length > 0 && (
        <section aria-labelledby="moi-ve">
          <ShelfTabs
            heading={
              <SectionHeading id="moi-ve" bar="bg-cobalt">
                Mới về kệ
              </SectionHeading>
            }
            tabs={tabs}
          />
        </section>
      )}

      {imageSearch && (
        <section
          aria-labelledby="tim-anh"
          className="grid items-center gap-10 border-3 border-ink bg-brand p-6 text-white shadow-[10px_10px_0_var(--color-ink)] sm:p-10 lg:grid-cols-2 lg:p-12"
        >
          <div className="flex flex-col gap-5">
            <p className="-rotate-3 self-start border-3 border-ink bg-surface px-3.5 py-1 font-condensed text-lg font-extrabold text-ink uppercase">Tìm bằng ảnh</p>
            <h2 id="tim-anh" className="pt-1 font-condensed text-[clamp(3rem,6vw,4.5rem)] leading-[0.95] font-black uppercase italic">
              Chụp. Tải lên.
              <br />
              Tìm ra.
            </h2>
            <p className="max-w-[44ch] text-lg leading-relaxed font-medium">
              Có ảnh một mô hình mà chưa biết tên? Tải ảnh lên, {site.name} đối chiếu với ảnh chụp nhiều góc từ mô hình 3D và gợi ý mẫu giống nhất.
            </p>
            <ButtonLink href="/tim-bang-anh" variant="secondary" size="lg" className="mt-2 self-start">
              <Camera className="size-5" strokeWidth={2.6} aria-hidden />
              Tải ảnh lên
            </ButtonLink>
          </div>
          {example && (
            <div aria-hidden className="flex flex-wrap items-center justify-center gap-5">
              <div className="w-52 -rotate-5 border-3 border-ink bg-surface p-3 pb-4">
                <ProductImage src={example.image} alt="" className="halftone h-48 w-full" />
                <p className="mt-2.5 font-condensed text-base font-extrabold text-ink uppercase">Ảnh của bạn</p>
              </div>
              <span className="font-condensed text-6xl font-black text-ink">→</span>
              <div className="w-52 rotate-3 border-3 border-ink bg-surface p-3 pb-4 text-ink shadow-[6px_6px_0_var(--color-ink)]">
                <ProductImage src={example.image} alt="" className="h-44 w-full" />
                <p className="mt-2 font-condensed text-lg leading-tight font-extrabold uppercase">{example.name}</p>
                <p className="mt-1 font-condensed text-2xl font-black italic tabular-nums">{formatVnd(example.price)}</p>
              </div>
            </div>
          )}
        </section>
      )}

      <ul aria-label="Cam kết của cửa hàng" className="grid bg-ink text-white sm:grid-cols-2 lg:grid-cols-4">
        {perks.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 px-6 py-5">
            <Icon className="size-7 shrink-0" strokeWidth={2.2} aria-hidden />
            <span className="font-condensed text-[21px] leading-tight font-extrabold uppercase">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
