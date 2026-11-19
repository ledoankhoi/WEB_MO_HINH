import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUpDown, Camera, Check, ExternalLink, Gamepad2, Paintbrush, Rotate3d, ShoppingCart, Users } from "lucide-react";
import { AdminLink } from "@/components/landing/AdminLink";
import { CountUp } from "@/components/landing/CountUp";
import { BOX, BOX_LG, SectionHeading, Sticker } from "@/components/store/StoreKit";
import { ModelCredit } from "@/components/three/ModelCredit";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import { ButtonLink } from "@/components/ui/Button";
import { buttonClass } from "@/components/ui/button-style";
import { site } from "@/config/site";
import { ADMIN_MODULES, AI_STEPS, ARCHITECTURE, ARCHITECTURE_LINKS, DEMO_STEPS, FEATURES, TECH, type LandingFeature, type LandingLinks } from "@/data/landing";
import { IMAGE_SEARCH_MODEL } from "@/lib/image-search";
import { pickShowcaseModel } from "@/lib/landing";
import { getModelFeatures, viewerHint } from "@/lib/model-features";
import { hasWorkshop } from "@/lib/workshop";
import { getFeaturedProducts, getProductBySlug, getShowcase, searchProducts } from "@/server/catalog";
import { getImageSearchStatus } from "@/server/image-search";
import { getBankAccount } from "@/server/payment";
import { vnpayConfig } from "@/server/payments/vnpay";

export const metadata: Metadata = {
  title: "Giới thiệu",
  description: `${site.name}: website thương mại điện tử bán mô hình robot sưu tầm. Xem 3D và biến hình ngay trên trình duyệt, tìm mẫu bằng ảnh, Xưởng tuỳ biến, website quản trị và kho riêng.`,
};

const ICONS: Record<LandingFeature["key"], LucideIcon> = {
  "xem-3d": Rotate3d,
  "tim-bang-anh": Camera,
  xuong: Paintbrush,
  gacha: Gamepad2,
  "cong-dong": Users,
  "mua-sam": ShoppingCart,
};
// Màu lần lượt của ô biểu tượng, dải tên tầng, số thứ tự bước: xanh coban, đỏ, đen (như ô danh mục ở trang chủ).
const TONES = ["bg-cobalt", "bg-brand", "bg-ink"];
const tone = (index: number) => TONES[index % TONES.length];

const FOOT_LINK =
  "mt-auto flex items-center justify-between gap-3 border-t-3 border-ink px-4 py-3 font-condensed text-lg font-extrabold uppercase transition hover:bg-ink hover:text-white";

// Trang Giới thiệu (/gioi-thieu): giới thiệu website như một sản phẩm đồ án cho người xem lần đầu (hội đồng): website làm
// được gì, số liệu thật, quản trị, kiến trúc, công nghệ và lộ trình demo. Chữ ở src/data/landing.ts.
export default async function AboutPage() {
  const [stats, imageSearch, transformable, featured] = await Promise.all([
    getShowcase(),
    getImageSearchStatus(IMAGE_SEARCH_MODEL.id),
    searchProducts({ q: "", category: "", sort: "moi-nhat", page: 1, pageSize: 100, transformable: true }),
    getFeaturedProducts(8),
  ]);
  const pick = pickShowcaseModel(transformable.items.length > 0 ? transformable.items : featured);
  const product = pick ? await getProductBySlug(pick.slug) : null;
  const features = product ? getModelFeatures(product.modelUrl) : null;
  const links: LandingLinks = product
    ? { product: `/san-pham/${product.slug}`, workshop: hasWorkshop(product.category) ? `/san-pham/${product.slug}/xuong` : `/san-pham/${product.slug}` }
    : { product: "/san-pham", workshop: "/san-pham" };

  // Phương thức thanh toán đang thật sự bật theo biến môi trường (chưa cấu hình thì chỉ có tiền mặt khi nhận hàng).
  const vnpay = vnpayConfig();
  const payments = ["tiền mặt khi nhận hàng", ...(getBankAccount() ? ["chuyển khoản VietQR"] : []), ...(vnpay ? [vnpay.sandbox ? "VNPay (sandbox)" : "VNPay"] : [])];
  // Cùng giá trị mặc định với src/proxy.ts.
  const adminHost = process.env.ADMIN_HOST?.trim() || "admin.localhost";

  const hint = `${viewerHint(features)}${features?.poses?.length ? " Chọn dáng ở hàng nút trên cùng của khung." : ""}`;

  const tiles = [
    { value: stats.products, label: "Mẫu đang bán" },
    { value: stats.transformable, label: "Mẫu biến hình, hợp thể 3D" },
    { value: imageSearch.products, label: "Mẫu tìm được bằng ảnh" },
    { value: stats.sold, label: "Mô hình đã bán (đơn mẫu)" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-24 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <section aria-labelledby="gioi-thieu" className={`grid bg-cobalt lg:grid-cols-2 ${BOX_LG}`}>
        <div className="flex flex-col gap-5 p-6 text-white sm:p-10 lg:p-12">
          <Sticker>Giới thiệu đồ án</Sticker>
          <h1 id="gioi-thieu" className="pt-1 font-condensed text-[clamp(3rem,7vw,5.25rem)] leading-[0.95] font-black uppercase italic">
            Robot sưu tầm,
            <br />
            <span className="my-1.5 inline-block -rotate-2 border-3 border-ink bg-brand px-3 pb-1">xoay 3D</span>
            <br />
            trước khi mua.
          </h1>
          <p className="max-w-[52ch] text-lg leading-relaxed font-medium text-white/90">
            {site.name} là website thương mại điện tử bán mô hình robot sưu tầm. Khách xoay, phóng to, xem biến hình từng mẫu ngay trên trình duyệt, tìm
            mẫu bằng ảnh chụp, tuỳ biến ở Xưởng rồi đặt hàng. Nhân viên xử lý đơn, kho và nội dung ở một website quản trị riêng.
          </p>
          <div className="mt-2 flex flex-wrap gap-4">
            <ButtonLink href="/san-pham" variant="secondary" size="lg">
              Vào cửa hàng
              <ArrowRight className="size-5" strokeWidth={2.6} aria-hidden />
            </ButtonLink>
            <ButtonLink href="#lo-trinh" size="lg">
              <ArrowDown className="size-5" strokeWidth={2.6} aria-hidden />
              Lộ trình demo
            </ButtonLink>
          </div>
        </div>
        <div className="stripes-cobalt flex flex-col gap-4 border-t-3 border-ink p-5 sm:p-7 lg:border-t-0 lg:border-l-3">
          {product ? (
            <>
              <div className="product-stage h-[360px] overflow-hidden border-3 border-ink sm:h-[460px]">
                <RobotViewerLoader model={product.model} colors={product.colors} modelUrl={product.modelUrl} features={features} label={`Mô hình 3D của ${product.name}`} />
              </div>
              <div className="border-3 border-ink bg-surface p-4 text-ink">
                <Link href={links.product} className="font-condensed text-xl leading-tight font-extrabold uppercase hover:text-brand">
                  {product.name}
                </Link>
                <p className="mt-1 text-sm text-muted">{hint}</p>
                <ModelCredit modelUrl={product.modelUrl} className="mt-1 text-xs text-muted" />
              </div>
            </>
          ) : (
            <p className="grid h-full min-h-60 place-items-center border-3 border-ink bg-surface p-6 text-center font-condensed text-xl font-extrabold text-ink uppercase">
              Chưa có sản phẩm nào đang bán.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="so-lieu" className="space-y-3">
        <h2 id="so-lieu" className="sr-only">
          Số liệu của cửa hàng
        </h2>
        <dl className="grid grid-cols-2 gap-px border-3 border-ink bg-white/25 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="flex flex-col-reverse justify-end gap-1 bg-ink px-5 py-6 text-white sm:px-7">
              <dt className="font-condensed text-lg leading-tight font-bold text-white/75 uppercase">{tile.label}</dt>
              <dd className="font-condensed text-5xl leading-none font-black italic sm:text-6xl">
                <CountUp value={tile.value} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted">
          Đếm trực tiếp từ CSDL. Đây là bản dùng thử: sản phẩm, giá, tồn kho là dữ liệu minh hoạ, số đã bán đến từ đơn hàng mẫu sinh cho demo.
        </p>
      </section>

      <section aria-labelledby="tinh-nang" className="space-y-12">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <SectionHeading id="tinh-nang" bar="bg-brand">
            Khách làm được gì
          </SectionHeading>
          <p className="max-w-[44ch] text-muted">Mỗi thẻ dẫn thẳng tới tính năng đang chạy để thử ngay.</p>
        </div>
        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = ICONS[feature.key];
            return (
              <li key={feature.key} className={`flex flex-col ${BOX}`}>
                <div className="flex items-center gap-3 border-b-3 border-ink p-4">
                  <span className={`grid size-12 shrink-0 place-items-center border-3 border-ink text-white ${tone(index)}`}>
                    <Icon className="size-6" strokeWidth={2.4} aria-hidden />
                  </span>
                  <h3 className="font-condensed text-2xl leading-tight font-extrabold uppercase">{feature.title}</h3>
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <p className="leading-relaxed">{feature.body}</p>
                  <ul className="space-y-1.5 text-[15px] text-muted">
                    {feature.points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-brand" strokeWidth={3} aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={feature.href(links)} className={FOOT_LINK}>
                  {feature.cta}
                  <ArrowRight className="size-5 shrink-0" strokeWidth={2.6} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="quan-tri"
        className="grid gap-10 border-3 border-ink bg-ink p-6 text-white shadow-[10px_10px_0_var(--color-brand)] sm:p-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:p-12"
      >
        <div className="flex flex-col gap-5">
          <Sticker>Website quản trị</Sticker>
          <h2 id="quan-tri" className="pt-1 font-condensed text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-black uppercase italic">
            Phía sau quầy
          </h2>
          <p className="max-w-[46ch] text-lg leading-relaxed text-white/85">
            Nhân viên làm việc ở một website riêng, tên miền riêng, phiên đăng nhập riêng. Mỗi trang, mỗi thao tác kiểm tra quyền theo vai trò; thao tác
            thay đổi dữ liệu được ghi nhật ký.
          </p>
          <AdminLink host={adminHost} className={`${buttonClass({ variant: "secondary", size: "lg" })} mt-2 self-start`}>
            <ExternalLink className="size-5" strokeWidth={2.6} aria-hidden />
            Mở trang quản trị
          </AdminLink>
          <p className="text-sm text-white/65">Cần tài khoản nhân viên. Tên miền quản trị: {adminHost}</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ADMIN_MODULES.map((module) => (
            <li key={module.title} className="border-3 border-ink bg-surface p-4 text-ink shadow-[5px_5px_0_var(--color-brand)]">
              <h3 className="font-condensed text-xl font-extrabold uppercase">{module.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-muted">{module.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cong-nghe" className="space-y-12">
        <SectionHeading id="cong-nghe" bar="bg-cobalt">
          Công nghệ phía sau
        </SectionHeading>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
          {ARCHITECTURE.map((tier, index) => (
            <Fragment key={tier.tier}>
              {index > 0 && (
                <div className="flex flex-col items-center justify-center gap-1 py-1 text-center lg:w-32">
                  <ArrowUpDown className="size-7 lg:hidden" strokeWidth={2.6} aria-hidden />
                  <ArrowLeftRight className="hidden size-8 lg:block" strokeWidth={2.6} aria-hidden />
                  <span className="font-condensed text-sm leading-tight font-bold text-muted uppercase">{ARCHITECTURE_LINKS[index - 1]}</span>
                </div>
              )}
              <div className={`flex flex-col ${BOX}`}>
                <h3 className={`border-b-3 border-ink px-4 py-2.5 font-condensed text-xl font-extrabold text-white uppercase ${tone(index)}`}>{tier.tier}</h3>
                <ul className="flex flex-col gap-2 p-4">
                  {tier.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span aria-hidden className="mt-2 size-2 shrink-0 bg-ink" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Fragment>
          ))}
        </div>

        <div className={`grid gap-8 bg-brand p-6 text-white sm:p-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center ${BOX_LG}`}>
          <div className="flex flex-col gap-4">
            <Sticker>Điểm nhấn AI</Sticker>
            <h3 className="pt-1 font-condensed text-[clamp(2rem,4vw,3rem)] leading-[0.95] font-black uppercase italic">Ảnh không rời máy khách</h3>
            <p className="text-lg leading-relaxed text-white/90">
              Tìm bằng ảnh dùng mô hình {IMAGE_SEARCH_MODEL.label} chạy ngay trong trình duyệt. Máy chủ chỉ nhận vector đặc trưng {IMAGE_SEARCH_MODEL.dim} số.
            </p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {AI_STEPS.map((step, index) => (
              <li key={step.title} className="border-3 border-ink bg-surface p-4 text-ink">
                <span aria-hidden className="font-condensed text-4xl leading-none font-black text-brand italic">
                  {index + 1}
                </span>
                <h4 className="mt-1 font-condensed text-xl font-extrabold uppercase">{step.title}</h4>
                <p className="mt-1 text-[15px] leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TECH.map((group) => (
            <li key={group.group} className={`${BOX} p-5`}>
              <h3 className="font-condensed text-xl font-extrabold uppercase">{group.group}</h3>
              <ul className="mt-3 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li key={item} className="border-2 border-ink bg-raised px-2.5 py-1 text-sm font-semibold">
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section id="lo-trinh" aria-labelledby="lo-trinh-tieu-de" className="scroll-mt-40 space-y-12">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <SectionHeading id="lo-trinh-tieu-de" bar="bg-brand">
            Lộ trình demo
          </SectionHeading>
          <p className="max-w-[50ch] text-muted">
            Sáu bước đi hết một vòng, từ lúc khách xem hàng tới khi nhân viên xử lý đơn. Thanh toán đang bật: {payments.join(", ")}.
          </p>
        </div>
        <ol className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_STEPS.map((step, index) => (
            <li key={step.title} className={`relative flex flex-col ${BOX}`}>
              <span
                aria-hidden
                className={`absolute -top-5 -left-3 grid size-12 place-items-center border-3 border-ink font-condensed text-2xl font-black text-white italic ${tone(index)}`}
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-2 p-5 pt-9">
                <h3 className="font-condensed text-2xl leading-tight font-extrabold uppercase">{step.title}</h3>
                <p className="leading-relaxed text-muted">{step.body}</p>
              </div>
              {"href" in step ? (
                <Link href={step.href(links)} className={FOOT_LINK}>
                  Thử bước này
                  <ArrowRight className="size-5 shrink-0" strokeWidth={2.6} aria-hidden />
                </Link>
              ) : (
                <AdminLink host={adminHost} className={FOOT_LINK}>
                  Mở trang quản trị
                  <ExternalLink className="size-5 shrink-0" strokeWidth={2.6} aria-hidden />
                </AdminLink>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="vao-cua-hang"
        className={`flex flex-col items-start gap-6 bg-cobalt p-6 text-white sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:p-12 ${BOX_LG}`}
      >
        <div className="space-y-3">
          <h2 id="vao-cua-hang" className="font-condensed text-[clamp(2.5rem,5vw,3.75rem)] leading-[0.95] font-black uppercase italic">
            Mời vào cửa hàng
          </h2>
          <p className="max-w-[56ch] text-lg text-white/85">Mọi tính năng trên trang này đang chạy, bấm vào là dùng được.</p>
        </div>
        <ButtonLink href="/san-pham" variant="secondary" size="lg" className="shrink-0">
          Xem tất cả sản phẩm
          <ArrowRight className="size-5" strokeWidth={2.6} aria-hidden />
        </ButtonLink>
      </section>
    </div>
  );
}
