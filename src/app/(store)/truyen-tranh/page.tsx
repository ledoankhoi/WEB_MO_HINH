import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX, PageHero, SectionHeading } from "@/components/store/StoreKit";
import { COMIC_CHAPTERS, COMIC_TITLE, chapterProducts } from "@/data/comics";
import { COMIC_READ_REWARD } from "@/lib/quests";
import { getProductsBySlugs } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Truyện tranh",
  description: `${COMIC_TITLE}: truyện tranh ngắn về các mô hình trên kệ ROBOTICA thức dậy khi cửa hàng đóng cửa.`,
};

export default async function ComicsPage() {
  const products = await getProductsBySlugs([...new Set(COMIC_CHAPTERS.flatMap(chapterProducts))]);

  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        tone="brand"
        sticker="Truyện tranh ROBOTICA"
        title={COMIC_TITLE}
        intro={`Khi cửa cuốn kéo xuống, các mô hình trên kệ bắt đầu cựa quậy. Truyện ngắn, đọc vài phút một chương; mỗi chương đọc xong nhận ${COMIC_READ_REWARD} xu để quay gacha.`}
        aside={<BookOpen aria-hidden className="hidden size-40 text-white/90 lg:block" strokeWidth={1.4} />}
      />

      <section aria-labelledby="cac-chuong" className="space-y-10">
        <SectionHeading id="cac-chuong" bar="bg-ink">
          Các chương
        </SectionHeading>
        <ol className="grid gap-8 md:grid-cols-3">
          {COMIC_CHAPTERS.map((chapter) => {
            const cover = products[chapterProducts(chapter)[0]];
            return (
              <li key={chapter.slug}>
                <Link href={`/truyen-tranh/${chapter.slug}`} className={`group flex h-full flex-col ${BOX} transition hover:-translate-y-1`}>
                  <span className="comic-burst relative border-b-3 border-ink">
                    <span className="absolute top-3 left-3 border-3 border-ink bg-brand px-3 py-1 font-condensed text-xl font-black text-white uppercase italic">
                      Ch.{String(chapter.number).padStart(2, "0")}
                    </span>
                    <ProductImage src={cover?.image ?? null} alt="" className="h-60 w-full p-4 transition duration-300 group-hover:scale-105" />
                  </span>
                  <span className="flex flex-1 flex-col gap-2 p-5">
                    <span className="font-condensed text-3xl leading-none font-black uppercase italic group-hover:text-brand">{chapter.title}</span>
                    <span className="text-sm text-muted">{chapter.summary}</span>
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 font-condensed text-lg font-extrabold uppercase">
                      Đọc chương <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
