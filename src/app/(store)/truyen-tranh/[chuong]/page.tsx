import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ChapterEnd } from "@/components/comic/ChapterEnd";
import { ComicPanel } from "@/components/comic/ComicPanel";
import { ProductGrid } from "@/components/product/ProductCard";
import { SectionHeading } from "@/components/store/StoreKit";
import { COMIC_CHAPTERS, COMIC_TITLE, chapterProducts, getComicChapter } from "@/data/comics";
import { getProductsBySlugs } from "@/server/catalog";

export function generateStaticParams() {
  return COMIC_CHAPTERS.map((chapter) => ({ chuong: chapter.slug }));
}

export async function generateMetadata({ params }: PageProps<"/truyen-tranh/[chuong]">): Promise<Metadata> {
  const chapter = getComicChapter((await params).chuong);
  return chapter ? { title: `Chương ${chapter.number}: ${chapter.title}`, description: chapter.summary } : { title: "Truyện tranh" };
}

async function Chapter({ params }: { params: PageProps<"/truyen-tranh/[chuong]">["params"] }) {
  const chapter = getComicChapter((await params).chuong);
  if (!chapter) notFound();
  const slugs = chapterProducts(chapter);
  const products = await getProductsBySlugs(slugs);
  const index = COMIC_CHAPTERS.indexOf(chapter);
  const previous = COMIC_CHAPTERS[index - 1];
  const next = COMIC_CHAPTERS[index + 1];
  const cast = slugs.map((slug) => products[slug]).filter(Boolean);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-4 border-ink pb-5">
        <div>
          <Link href="/truyen-tranh" className="font-condensed text-base font-bold tracking-wide text-muted uppercase hover:text-brand">
            {COMIC_TITLE}
          </Link>
          <h1 className="font-condensed text-[clamp(2.5rem,6vw,4.5rem)] leading-none font-black uppercase italic">
            <span className="text-brand">Ch.{String(chapter.number).padStart(2, "0")}</span> {chapter.title}
          </h1>
        </div>
        <p className="max-w-[44ch] text-sm text-muted">{chapter.summary}</p>
      </header>

      <div className="grid grid-cols-6 gap-3 border-4 border-ink bg-ink p-3 sm:gap-4 sm:p-4">
        {chapter.panels.map((panel, panelIndex) => (
          <ComicPanel key={panelIndex} panel={panel} product={panel.product ? (products[panel.product] ?? null) : null} />
        ))}
      </div>

      <ChapterEnd chapter={chapter.slug} />

      <nav aria-label="Chuyển chương" className="flex flex-wrap justify-between gap-3">
        {previous ? (
          <Link href={`/truyen-tranh/${previous.slug}`} className="inline-flex items-center gap-2 border-3 border-ink px-4 py-2 font-condensed text-lg font-extrabold uppercase hover:bg-raised">
            <ArrowLeft className="size-4" strokeWidth={2.6} aria-hidden /> Ch.{String(previous.number).padStart(2, "0")} {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={`/truyen-tranh/${next.slug}`} className="inline-flex items-center gap-2 border-3 border-ink bg-brand px-4 py-2 font-condensed text-lg font-extrabold text-white uppercase hover:brightness-110">
            Ch.{String(next.number).padStart(2, "0")} {next.title} <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
          </Link>
        )}
      </nav>

      {cast.length > 0 && (
        <section aria-labelledby="nhan-vat" className="space-y-10 pt-6">
          <SectionHeading id="nhan-vat" bar="bg-brand">
            Nhân vật trong chương
          </SectionHeading>
          <ProductGrid products={cast} />
        </section>
      )}
    </>
  );
}

export default function ChapterPage({ params }: PageProps<"/truyen-tranh/[chuong]">) {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang mở chương...</p>}>
        <Chapter params={params} />
      </Suspense>
    </div>
  );
}
