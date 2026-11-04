import Link from "next/link";
import { ArrowRight, Box, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { HeroBanner, StripBanners } from "@/components/content/Banners";
import { HeroShowcase, type HeroItem } from "@/components/content/HeroShowcase";
import { ProductGrid, ProductImage } from "@/components/product/ProductCard";
import { ProductTabs } from "@/components/product/ProductTabs";
import { buttonClass } from "@/components/ui/Button";
import { site } from "@/config/site";
import { CATEGORIES, getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { getModelFeatures, MODEL_FEATURES } from "@/lib/model-features";
import { getActiveBanners, getCategoryCounts, getFeaturedProducts, getProductBySlug, searchProducts } from "@/server/catalog";

// Bộ hợp thể đầu tiên đang bán (theo thứ tự trong MODEL_FEATURES) cho dải giới thiệu hợp thể.
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

export default async function Home() {
  const [featured, newest, counts, banners, combiner] = await Promise.all([
    getFeaturedProducts(8),
    searchProducts({ q: "", category: "", sort: "moi-nhat", page: 1, pageSize: 8 }),
    getCategoryCounts(),
    getActiveBanners(),
    findCombiner(),
  ]);
  // Không có banner thì trang chủ giữ nguyên như trước (YC-CMS-02).
  const heroBanner = banners.find((banner) => banner.placement === "home_hero");
  const stripBanners = banners.filter((banner) => banner.placement === "home_strip");

  // Bốn sản phẩm nổi bật đầu tiên đổi qua lại ở đầu trang.
  const heroProducts = (await Promise.all(featured.slice(0, 4).map((item) => getProductBySlug(item.slug)))).filter((p) => p !== null);
  const heroItems: HeroItem[] = heroProducts.map((product) => ({
    slug: product.slug,
    name: product.name,
    tagline: product.tagline,
    categoryName: getCategory(product.category)?.name ?? "Mô hình",
    price: product.price,
    stock: product.stock,
    variantId: product.variantId,
    image: product.image,
    viewer: {
      model: product.model,
      colors: product.colors,
      modelUrl: product.modelUrl,
      features: getModelFeatures(product.modelUrl),
      label: `Mô hình 3D của ${product.name}`,
    },
  }));

  // Ảnh đại diện cho từng danh mục: sản phẩm mới nhất của danh mục đó.
  const categoryImages = await Promise.all(
    CATEGORIES.map(async (category) => (await searchProducts({ q: "", category: category.slug, sort: "moi-nhat", page: 1, pageSize: 1 })).items[0]?.image ?? null),
  );

  const perks = [
    { icon: Box, title: "Xem 3D trước khi mua", text: "Xoay, phóng to, xem biến hình" },
    { icon: Truck, title: "Miễn phí vận chuyển", text: `Đơn từ ${formatVnd(site.shipping.freeFrom)}` },
    { icon: RotateCcw, title: `Đổi trả ${site.policy.returnDays} ngày`, text: "Theo chính sách cửa hàng" },
    { icon: ShieldCheck, title: `Bảo hành ${site.policy.warrantyMonths} tháng`, text: "Theo chính sách cửa hàng" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      {heroBanner && <HeroBanner banner={heroBanner} />}
      {heroItems.length > 0 ? (
        <HeroShowcase items={heroItems} />
      ) : (
        <section className="rounded-[1.75rem] border border-line bg-surface p-10">
          <h1 className="text-4xl font-extrabold tracking-tight">Khám phá thế giới robot sưu tầm</h1>
          <Link href="/san-pham" className={`${buttonClass({ size: "lg" })} mt-6`}>
            Khám phá bộ sưu tập
          </Link>
        </section>
      )}

      <StripBanners banners={stripBanners} />

      <section aria-labelledby="danh-muc">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 id="danh-muc" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Mua theo dòng robot
          </h2>
          <Link href="/san-pham" className="flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
            Tất cả sản phẩm <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-7">
          {CATEGORIES.map((category, index) => (
            <li key={category.slug} className="w-36 shrink-0 snap-start sm:w-auto">
              <Link href={`/san-pham?loai=${category.slug}`} className="group flex flex-col gap-2">
                <span className="product-stage block aspect-square overflow-hidden rounded-2xl border border-line transition group-hover:border-brand">
                  <ProductImage src={categoryImages[index]} alt="" className="size-full p-3 transition duration-500 group-hover:scale-105" />
                </span>
                <span className="text-sm leading-snug font-semibold">{category.name}</span>
                <span className="-mt-1.5 text-xs text-muted">{counts[category.slug] ?? 0} sản phẩm</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Sản phẩm">
        <ProductTabs
          tabs={[
            { value: "moi", label: "Hàng mới về", content: <ProductGrid products={newest.items} /> },
            ...(featured.length > 0 ? [{ value: "noi-bat", label: "Nổi bật", content: <ProductGrid products={featured} /> }] : []),
          ]}
          action={
            <Link href="/san-pham" className="flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
              Xem tất cả <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
      </section>

      {combiner && (
        <section aria-labelledby="hop-the" className="grid overflow-hidden rounded-[1.75rem] bg-fg text-bg lg:grid-cols-2">
          <div className="flex flex-col gap-5 p-8 sm:p-12">
            <p className="text-xs font-bold tracking-[0.2em] text-brand uppercase">Robot hợp thể</p>
            <h2 id="hop-the" className="text-3xl leading-tight font-extrabold sm:text-4xl">
              Xem từng thành viên ghép lại thành {combiner.product.name.split(" (")[0]}
            </h2>
            <p className="text-bg/70">
              Mua lẻ từng thành viên hoặc cả bộ. Mô hình 3D cho thấy mỗi món nằm ở đâu khi hợp thể.
            </p>
            {combiner.members.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {combiner.members.map((member) => (
                  <li key={member.id}>
                    <Link href={`/san-pham/${member.slug}`} className="inline-flex rounded-full border border-bg/20 px-3.5 py-2 text-sm transition hover:border-brand hover:text-brand">
                      {member.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/san-pham/${combiner.product.slug}`} className={`${buttonClass({ size: "lg" })} mt-2 self-start`}>
              Xem hợp thể 3D
            </Link>
          </div>
          <div className="relative min-h-72 bg-bg/5">
            <ProductImage src={combiner.product.image} alt={combiner.product.name} className="absolute inset-0 size-full p-8" />
          </div>
        </section>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {perks.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong">
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="text-sm text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
