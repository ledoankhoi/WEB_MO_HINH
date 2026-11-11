import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Crown } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX, PageHero, SectionHeading } from "@/components/store/StoreKit";
import { getCategory } from "@/lib/catalog";
import { formatDate, formatVnd } from "@/lib/format";
import { transformLabel } from "@/lib/model-features";
import { getRanking, getShowcase } from "@/server/catalog";
import { RANKINGS, isRankingSlug, type RankedProduct, type RankingSlug } from "@/server/repo/showcase";

export const metadata: Metadata = {
  title: "Trưng bày",
  description: "Bảng xếp hạng mô hình robot: bán chạy, được yêu thích, đánh giá cao, được chờ hàng nhiều nhất và mới về kệ.",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const nf = new Intl.NumberFormat("vi-VN");

// Giá trị xếp hạng hiển thị dưới tên sản phẩm.
function metric(slug: RankingSlug, item: RankedProduct): string {
  if (slug === "moi-ve") return `Lên kệ ${formatDate(item.value)}`;
  if (slug === "danh-gia") return `${item.value.toLocaleString("vi-VN")}/5 · ${item.count} đánh giá`;
  const ranking = RANKINGS.find((r) => r.slug === slug)!;
  return `${nf.format(item.value)} ${ranking.unit}`;
}

const PODIUM = [
  { rank: 2, tone: "bg-cobalt", lift: "lg:mt-16" },
  { rank: 1, tone: "bg-brand", lift: "" },
  { rank: 3, tone: "bg-ink", lift: "lg:mt-24" },
];

function Podium({ slug, items }: { slug: RankingSlug; items: RankedProduct[] }) {
  return (
    <ol className="grid gap-8 sm:grid-cols-3 sm:items-start">
      {PODIUM.map(({ rank, tone, lift }) => {
        const item = items[rank - 1];
        if (!item) return <li key={rank} aria-hidden className="hidden sm:block" />;
        const sticker = transformLabel(item.product.modelUrl);
        return (
          <li key={rank} className={`${lift} ${rank === 1 ? "order-first sm:order-none" : ""}`}>
            <Link href={`/san-pham/${item.product.slug}`} className={`group flex flex-col ${BOX} transition hover:-translate-y-1`}>
              <span className="halftone relative grid place-items-center border-b-3 border-ink">
                <span className={`absolute top-3 left-3 flex size-14 items-center justify-center border-3 border-ink font-condensed text-3xl font-black text-white italic ${tone}`}>
                  {rank === 1 ? <Crown className="size-7" strokeWidth={2.6} aria-label="Hạng 1" /> : `#${rank}`}
                </span>
                {sticker && (
                  <span className="absolute top-3 right-3 rotate-3 border-2 border-ink bg-brand px-2 py-0.5 font-condensed text-sm font-extrabold text-white uppercase">
                    {sticker}
                  </span>
                )}
                <ProductImage
                  src={item.product.image}
                  alt=""
                  className={`w-full p-4 transition duration-300 group-hover:scale-105 ${rank === 1 ? "h-80" : "h-64"}`}
                />
              </span>
              <span className="flex flex-1 flex-col gap-1 p-4">
                <span className="font-condensed text-sm font-bold tracking-[0.08em] text-cobalt uppercase">{getCategory(item.product.category)?.name}</span>
                <span className="font-condensed text-2xl leading-tight font-extrabold uppercase group-hover:text-brand">{item.product.name}</span>
                <span className="mt-1 self-start bg-ink px-2.5 py-1 font-condensed text-lg font-extrabold text-white uppercase">{metric(slug, item)}</span>
                <span className="mt-2 font-condensed text-2xl font-black italic tabular-nums">{formatVnd(item.product.price)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

async function Rankings({ searchParams }: { searchParams: PageProps<"/trung-bay">["searchParams"] }) {
  const param = first((await searchParams).bang);
  const slug: RankingSlug = isRankingSlug(param) ? param : "ban-chay";
  const ranking = RANKINGS.find((r) => r.slug === slug)!;
  const items = await getRanking(slug, 10);

  return (
    <section aria-labelledby="bang-xep-hang" className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <SectionHeading id="bang-xep-hang" bar="bg-brand">
          Bảng xếp hạng
        </SectionHeading>
        <p className="max-w-[46ch] text-sm text-muted">{ranking.note}</p>
      </div>

      <nav aria-label="Chọn bảng xếp hạng" className="flex overflow-x-auto border-3 border-ink bg-surface">
        {RANKINGS.map((item) => {
          const current = item.slug === slug;
          return (
            <Link
              key={item.slug}
              href={item.slug === "ban-chay" ? "/trung-bay" : `/trung-bay?bang=${item.slug}`}
              scroll={false}
              aria-current={current ? "page" : undefined}
              className={`flex h-14 flex-1 shrink-0 items-center justify-center text-center border-r-3 border-ink px-5 font-condensed text-lg font-extrabold tracking-[0.02em] whitespace-nowrap uppercase transition last:border-r-0 ${
                current ? "bg-ink text-white" : "hover:text-brand"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className={`${BOX} px-6 py-14 text-center font-condensed text-xl font-extrabold uppercase`}>Bảng này chưa có dữ liệu. Quay lại sau nhé!</p>
      ) : (
        <>
          <Podium slug={slug} items={items} />
          {items.length > 3 && (
            <ol start={4} className={`divide-y-3 divide-ink ${BOX}`}>
              {items.slice(3).map((item, index) => (
                <li key={item.product.id}>
                  <Link href={`/san-pham/${item.product.slug}`} className="group flex items-center gap-4 px-4 py-3 transition hover:bg-raised sm:gap-6 sm:px-6">
                    <span className="w-12 shrink-0 font-condensed text-4xl font-black text-muted italic tabular-nums">#{index + 4}</span>
                    <span className="halftone size-16 shrink-0 border-2 border-ink">
                      <ProductImage src={item.product.image} alt="" className="size-full p-1" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-condensed text-xl font-extrabold uppercase group-hover:text-brand">{item.product.name}</span>
                      <span className="text-sm text-muted">{getCategory(item.product.category)?.name}</span>
                    </span>
                    <span className="hidden font-condensed text-lg font-extrabold uppercase sm:block">{metric(slug, item)}</span>
                    <span className="font-condensed text-xl font-black italic tabular-nums">{formatVnd(item.product.price)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

// Quán quân của mỗi bảng (trừ Mới về kệ): nhìn nhanh mẫu đứng đầu ở mọi tiêu chí.
async function Champions() {
  const boards = RANKINGS.filter((r) => r.slug !== "moi-ve");
  const tops = await Promise.all(boards.map(async (board) => ({ board, item: (await getRanking(board.slug, 1))[0] })));
  const shown = tops.filter((top) => top.item);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="quan-quan" className="space-y-10">
      <SectionHeading id="quan-quan" bar="bg-cobalt">
        Quán quân mỗi bảng
      </SectionHeading>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map(({ board, item }) => (
          <li key={board.slug}>
            <Link href={`/trung-bay?bang=${board.slug}`} scroll={false} className={`group flex h-full flex-col ${BOX} transition hover:-translate-y-1`}>
              <span className="flex items-center justify-between bg-ink px-3.5 py-2 font-condensed text-lg font-extrabold text-white uppercase">
                {board.label}
                <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
              </span>
              <span className="halftone border-y-3 border-ink">
                <ProductImage src={item!.product.image} alt="" className="h-40 w-full p-2" />
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3.5">
                <span className="font-condensed text-lg leading-tight font-extrabold uppercase group-hover:text-brand">{item!.product.name}</span>
                <span className="font-condensed text-base font-bold text-brand uppercase">{metric(board.slug, item!)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Stats() {
  const stats = await getShowcase();
  const tiles = [
    { value: nf.format(stats.products), label: "Mẫu đang bày bán" },
    { value: nf.format(stats.transformable), label: "Mẫu biến hình 3D" },
    { value: nf.format(stats.sold), label: "Mô hình đã bán ra" },
    { value: stats.rating === null ? "—" : `${stats.rating.toLocaleString("vi-VN")}★`, label: `Điểm TB · ${nf.format(stats.reviews)} đánh giá` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:w-[26rem]">
      {tiles.map((tile) => (
        <div key={tile.label} className="border-3 border-ink bg-surface p-4 text-ink shadow-[5px_5px_0_var(--color-brand)]">
          <dt className="font-condensed text-sm leading-tight font-bold text-muted uppercase">{tile.label}</dt>
          <dd className="mt-1 font-condensed text-4xl font-black italic tabular-nums">{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ShowcasePage({ searchParams }: PageProps<"/trung-bay">) {
  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        tone="ink"
        sticker="Phòng trưng bày"
        title={
          <>
            Những cỗ máy
            <br />
            <span className="text-brand">được săn nhiều nhất</span>
          </>
        }
        intro="Bảng xếp hạng cập nhật từ chính đơn hàng, lượt yêu thích, đánh giá và yêu cầu chờ hàng của khách ROBOTICA. Xem mẫu nào đang dẫn đầu trước khi chọn món tiếp theo cho kệ của bạn."
        aside={
          <Suspense fallback={<div className="h-48 lg:w-[26rem]" />}>
            <Stats />
          </Suspense>
        }
      />
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải bảng xếp hạng...</p>}>
        <Rankings searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <Champions />
      </Suspense>
    </div>
  );
}
