import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ArrivalCountdown } from "@/components/product/ArrivalCountdown";
import { CompareButton } from "@/components/product/CompareButton";
import { FlashPrice } from "@/components/product/FlashPrice";
import { ProductImage } from "@/components/product/ProductCard";
import { StockAlertButton } from "@/components/product/StockAlertButton";
import { WishlistButton } from "@/components/product/WishlistButton";
import { BOX, PageHero, SectionHeading } from "@/components/store/StoreKit";
import { site } from "@/config/site";
import { getCategory } from "@/lib/catalog";
import { discountPercent, formatDate, formatVnd } from "@/lib/format";
import { transformLabel } from "@/lib/model-features";
import { canPreorder, lineDeposit, orderableQty, type PreorderOffer } from "@/lib/preorder";
import { getComingProducts } from "@/server/catalog";
import type { ComingProduct } from "@/server/repo/preorders";

export const metadata: Metadata = {
  title: "Hàng sắp về",
  description: "Mô hình robot sắp về hàng tại ROBOTICA: xem ngày dự kiến về, đặt trước giữ suất bằng tiền cọc, hàng về là được giữ riêng cho bạn.",
  alternates: { canonical: "/hang-sap-ve" },
};

const VN_OFFSET_MS = 7 * 3600 * 1000;

// Nhóm theo tháng dự kiến về (giờ Việt Nam), tháng sớm trước; đợt ngừng nhận đặt xếp sau cùng trong tháng (đã sắp ở truy vấn).
function byMonth(items: ComingProduct[]): { key: string; label: string; items: ComingProduct[] }[] {
  const groups = new Map<string, { key: string; label: string; items: ComingProduct[] }>();
  for (const item of [...items].sort((a, b) => a.offer.expectedAt - b.offer.expectedAt)) {
    const date = new Date(item.offer.expectedAt + VN_OFFSET_MS);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const group = groups.get(key) ?? { key, label: `Tháng ${date.getUTCMonth() + 1}/${date.getUTCFullYear()}`, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

const STEPS = [
  { title: "Chọn mẫu sắp về", text: "Mỗi mẫu ghi ngày dự kiến về, phần trăm cọc và số suất còn lại." },
  { title: "Đặt cọc giữ suất", text: "Chuyển khoản hoặc VNPay tiền cọc (có mẫu không cần cọc). Muốn trả đủ luôn cũng được." },
  { title: "Hàng về, giữ riêng", text: "Hàng về được chia theo thứ tự đặt. Bạn nhận email khi hàng về hoặc khi lịch về đổi." },
  { title: "Giao và trả nốt", text: "Phần còn lại trả khi nhận hàng, hoặc trả trước ở trang đơn." },
];

// Luật đặt trước nói bằng lời của khách (docs/chuan/04-trang-thai.md mục 5.1, src/lib/preorder.ts). Sửa luật thì sửa cả ở đây.
const RULES = [
  {
    title: "Suất đặt trước",
    text: "Mỗi đợt có thể giới hạn số suất. Suất được giữ cho bạn ngay khi đặt, trả lại khi đơn bị huỷ. Hết suất thì mẫu ngừng nhận đặt. Trong thời gian mở đặt trước, mẫu chỉ bán dạng đặt trước (kể cả số hàng còn trong kho), để hàng về được chia cho người đã đặt.",
  },
  {
    title: "Tiền cọc",
    text: "Cọc = giá × số lượng × phần trăm cọc của đợt, làm tròn lên tới nghìn đồng. Cọc 0%: chỉ đặt chỗ, trả đủ khi nhận. Cọc 100%: trả đủ khi đặt, không nhận thanh toán khi nhận hàng. Ở mức khác, bạn chọn chỉ trả cọc (chuyển khoản hoặc VNPay, phần còn lại trả khi nhận hoặc trả trước ở trang đơn) hay trả đủ luôn. Giá chốt lúc đặt: về sau giá có đổi thì số tiền còn lại của bạn vẫn giữ nguyên.",
  },
  {
    title: "Thứ tự chia hàng",
    text: "Hàng về được chia theo thứ tự đặt, đơn đặt trước nhận trước, không nhảy cóc. Chỉ đơn đã nhận cọc hoặc đã trả (hoặc đơn không cần cọc) mới được chia; đơn chưa trả cọc phải chờ tới khi trả và còn hàng.",
  },
  {
    title: "Ngày về là dự kiến",
    text: "Nhà cung cấp có thể giao sớm hoặc muộn hơn. Lịch về đổi thì bạn nhận email; hàng về và đã giữ riêng cho đơn của bạn thì bạn cũng nhận email.",
  },
  {
    title: "Đơn có cả hàng có sẵn",
    text: "Đơn được đóng gói và giao một lần khi mọi món đặt trước trong đơn đã về. Muốn nhận hàng có sẵn sớm thì đặt thành hai đơn riêng.",
  },
  {
    title: "Huỷ và hoàn tiền",
    text: "Bạn tự huỷ được khi đơn còn chờ xác nhận; sau đó liên hệ cửa hàng, đơn huỷ được cho tới trước khi giao cho đơn vị vận chuyển. Đơn huỷ được hoàn mọi khoản đã trả, gồm cả tiền cọc.",
  },
];

// Hai khoản tiền của một đợt (trả lúc đặt, trả lúc nhận), tính cho 1 chiếc theo giá hiện tại.
function paymentFacts(offer: PreorderOffer, price: number): { label: string; value: string; hint: string }[] {
  if (offer.depositPercent <= 0) {
    return [
      { label: "Tiền cọc", value: "Không cần", hint: "Chỉ đặt chỗ, giữ suất không mất tiền" },
      { label: "Trả khi nhận", value: formatVnd(price), hint: "Tiền mặt khi nhận, hoặc chọn trả trước lúc đặt" },
    ];
  }
  if (offer.depositPercent >= 100) {
    return [
      { label: "Trả khi đặt", value: formatVnd(price), hint: "Trả đủ 100%, không nhận thanh toán khi nhận hàng" },
      { label: "Trả khi nhận", value: formatVnd(0), hint: "Đã trả đủ lúc đặt" },
    ];
  }
  const deposit = lineDeposit(price, 1, offer.depositPercent);
  return [
    { label: `Cọc ${offer.depositPercent}%`, value: formatVnd(deposit), hint: "Chuyển khoản hoặc VNPay lúc đặt" },
    { label: "Trả khi nhận", value: formatVnd(price - deposit), hint: "Hoặc trả trước ở trang đơn" },
  ];
}

function Fact({ label, value, hint, className = "" }: { label: string; value: ReactNode; hint: ReactNode; className?: string }) {
  return (
    <div className={`border-2 border-ink px-3 py-3 sm:px-3.5 ${className}`}>
      <dt className="font-condensed text-sm font-bold tracking-[0.06em] text-muted uppercase">{label}</dt>
      <dd className="font-condensed text-xl leading-tight font-black italic tabular-nums sm:text-2xl">{value}</dd>
      <dd className="min-h-4 text-xs text-muted">{hint}</dd>
    </div>
  );
}

// Suất của đợt: còn bao nhiêu trên tổng số; thanh là phần suất còn lại, ngắn dần khi có người đặt.
function SlotMeter({ item }: { item: ComingProduct }) {
  const { offer, maxQty, taken } = item;
  const closed = offer.status === "closed";
  const text = closed ? "Ngừng nhận đặt" : maxQty === null ? "Không giới hạn suất" : offer.left === 0 ? "Đã hết suất" : `Còn ${offer.left}/${maxQty} suất`;
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-condensed text-lg font-extrabold uppercase">{text}</span>
        {taken > 0 && <span className="text-sm text-muted">Đã đặt {taken} chiếc</span>}
      </p>
      {maxQty !== null && (
        <div aria-hidden className="h-3 border-2 border-ink bg-raised">
          <div className={`h-full ${closed ? "bg-muted" : "bg-cobalt"}`} style={{ width: `${Math.max(0, Math.min(100, ((maxQty - taken) / maxQty) * 100))}%` }} />
        </div>
      )}
    </div>
  );
}

// Thẻ chi tiết của một đợt đặt trước: ảnh lớn, thông tin sản phẩm, ngày về, tiền phải trả, suất, ghi chú và thông số.
// Ảnh là ảnh dựng từ mô hình 3D như mọi thẻ sản phẩm; ảnh thật chỉ hiện ở trang chi tiết (nút dẫn sang đó ghi số ảnh).
function OfferCard({ item }: { item: ComingProduct }) {
  const { product, offer } = item;
  const href = `/san-pham/${product.slug}`;
  const open = canPreorder(offer);
  const sticker = transformLabel(product.modelUrl);
  const discount = discountPercent(product.price, product.compareAtPrice);
  const origin = [getCategory(product.category)?.name, item.brand, item.series].filter((part): part is string => !!part);

  return (
    <article className={`${BOX} grid overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`}>
      <div className="relative border-b-3 border-ink lg:border-r-3 lg:border-b-0">
        <Link
          href={href}
          className="halftone flex aspect-square items-center justify-center sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[30rem]"
          tabIndex={-1}
          aria-hidden
        >
          <ProductImage src={product.image} alt="" className={`size-full p-3 sm:p-5 ${open ? "" : "opacity-60 grayscale"}`} />
        </Link>
        <div className="pointer-events-none absolute top-4 left-3 flex flex-col items-start gap-2">
          <span className="-rotate-3 border-2 border-ink bg-ink px-3 py-0.5 font-condensed text-lg font-extrabold text-white uppercase">Đặt trước</span>
          {sticker && (
            <span className="rotate-2 border-2 border-ink bg-brand px-3 py-0.5 font-condensed text-lg font-extrabold text-white uppercase">{sticker}</span>
          )}
          {discount !== null && (
            <span className="-rotate-2 border-2 border-ink bg-cobalt px-3 py-0.5 font-condensed text-lg font-extrabold text-white uppercase">
              Giảm {discount}%
            </span>
          )}
        </div>
        <WishlistButton productId={product.id} name={product.name} className="absolute top-3 right-3" />
      </div>

      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <header className="space-y-2">
          {origin.length > 0 && <p className="font-condensed text-[15px] font-bold tracking-[0.08em] text-cobalt uppercase">{origin.join(" · ")}</p>}
          <h3 className="font-condensed text-[clamp(1.75rem,3.2vw,2.5rem)] leading-none font-extrabold uppercase">
            <Link href={href} className="hover:text-brand">
              {product.name}
            </Link>
          </h3>
          {!item.isDefaultVariant && <p className="text-sm font-semibold">Phiên bản: {item.variantName}</p>}
          {product.tagline && <p className="text-muted">{product.tagline}</p>}
          <FlashPrice flash={product.flash} basePrice={product.price}>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <p className={`font-condensed text-4xl leading-tight font-black italic tabular-nums ${discount !== null ? "text-brand" : ""}`}>
                {formatVnd(product.price)}
              </p>
              {discount !== null && <p className="text-muted line-through tabular-nums">{formatVnd(product.compareAtPrice!)}</p>}
            </div>
          </FlashPrice>
        </header>

        <div className="space-y-2">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Fact
              label="Dự kiến về"
              value={formatDate(offer.expectedAt)}
              hint={<ArrivalCountdown expectedAt={offer.expectedAt} />}
              className="col-span-2 sm:col-span-1"
            />
            {paymentFacts(offer, product.price).map((fact) => (
              <Fact key={fact.label} {...fact} />
            ))}
          </dl>
          <p className="text-xs text-muted">Tính cho 1 chiếc theo giá hiện tại; số tiền chính xác hiện ở bước thanh toán.</p>
        </div>

        <SlotMeter item={item} />

        {offer.note && (
          <p className="border-l-4 border-cobalt bg-raised px-4 py-2.5 text-sm">
            <span className="font-semibold">Cửa hàng ghi chú: </span>
            {offer.note}
          </p>
        )}

        {item.specs.length > 0 && (
          <dl className="grid gap-x-6 gap-y-1.5 border-t-2 border-line pt-4 text-sm sm:grid-cols-2">
            {item.specs.slice(0, 6).map((spec, index) => (
              <div key={`${spec.label}-${index}`} className="flex gap-1.5">
                <dt className="shrink-0 text-muted">{spec.label}:</dt>
                <dd className="font-medium">{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
          <div className="sm:w-60">
            {open ? (
              <AddToCartButton
                id={product.variantId}
                name={product.name}
                stock={orderableQty(product.stock, offer, site.maxQtyPerItem)}
                bar
                label="Đặt trước"
                preorder
              />
            ) : (
              <div className="space-y-2">
                <p className="font-condensed text-lg font-extrabold text-brand-strong uppercase">{offer.status === "closed" ? "Ngừng nhận đặt" : "Hết suất đặt trước"}</p>
                <StockAlertButton variantId={product.variantId} name={product.name} />
              </div>
            )}
          </div>
          <Link
            href={href}
            className="inline-flex h-12 items-center justify-center border-3 border-ink px-5 font-condensed text-[19px] font-extrabold uppercase transition hover:bg-raised"
          >
            {item.photoCount > 0 ? `Xem ${item.photoCount} ảnh thật, xoay 3D` : "Xem chi tiết, xoay 3D"}
          </Link>
          <CompareButton slug={product.slug} name={product.name} className="self-start sm:ml-auto sm:self-center" />
        </div>
      </div>
    </article>
  );
}

async function Coming() {
  const items = await getComingProducts();
  if (items.length === 0) {
    return (
      <div className={`${BOX} space-y-3 p-8 text-center`}>
        <p className="font-condensed text-2xl font-extrabold uppercase">Chưa có mẫu nào đang mở đặt trước</p>
        <p className="text-muted">
          Ghé lại sau, hoặc bấm “Báo khi có hàng” ở mẫu đang hết để được báo khi về.{" "}
          <Link href="/san-pham" className="font-semibold text-brand-strong underline">
            Xem hàng có sẵn
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-16">
      {byMonth(items).map((group, index) => (
        <section key={group.key} aria-labelledby={`thang-${group.key}`} className="space-y-8">
          <SectionHeading id={`thang-${group.key}`} bar={index % 2 === 0 ? "bg-cobalt" : "bg-brand"}>
            Về {group.label.toLowerCase()}
          </SectionHeading>
          <ul className="space-y-10">
            {group.items.map((item) => (
              <li key={item.offer.id}>
                <OfferCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function ComingSoonPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        sticker="Hàng sắp về"
        title={
          <>
            Đặt trước
            <br />
            <span className="text-ink">giữ suất sớm</span>
          </>
        }
        intro="Những mẫu đang trên đường về kho ROBOTICA. Đặt cọc để giữ suất, không lo hết hàng ngay ngày mở bán; hàng về là được giữ riêng theo thứ tự đặt."
      />

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className={`${BOX} space-y-2 p-5`}>
            <p className="font-condensed text-4xl font-black text-cobalt italic">{String(index + 1).padStart(2, "0")}</p>
            <p className="font-condensed text-xl font-extrabold uppercase">{step.title}</p>
            <p className="text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>

      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải hàng sắp về...</p>}>
        <Coming />
      </Suspense>

      <section aria-labelledby="luat-dat-truoc" className="space-y-8">
        <SectionHeading id="luat-dat-truoc">Luật đặt trước</SectionHeading>
        <dl className="grid gap-4 md:grid-cols-2">
          {RULES.map((rule) => (
            <div key={rule.title} className={`${BOX} space-y-2 p-5`}>
              <dt className="font-condensed text-xl font-extrabold uppercase">{rule.title}</dt>
              <dd className="text-sm text-muted">{rule.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
