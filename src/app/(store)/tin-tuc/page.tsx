import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { BOX, PageHero, SectionHeading } from "@/components/store/StoreKit";
import { formatDate } from "@/lib/format";
import { getPublishedNews } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Tin tức",
  description: "Tin tức ROBOTICA: hàng mới về, đợt đặt trước, khuyến mãi và chuyện trong giới sưu tầm mô hình robot.",
};

export default async function NewsPage() {
  const posts = await getPublishedNews();

  return (
    <div className="mx-auto max-w-7xl space-y-20 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        tone="ink"
        sticker="Bản tin ROBOTICA"
        title="Tin tức"
        intro="Hàng mới về, đợt đặt trước, khuyến mãi và chuyện trong giới sưu tầm mô hình robot."
        aside={<Newspaper aria-hidden className="hidden size-40 text-white/90 lg:block" strokeWidth={1.4} />}
      />

      <section aria-labelledby="bai-moi" className="space-y-10">
        <SectionHeading id="bai-moi">Bài mới</SectionHeading>
        {posts.length === 0 ? (
          <p className={`p-8 text-center text-muted ${BOX}`}>Chưa có bài viết nào. Quay lại sau nhé.</p>
        ) : (
          <ul className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/tin-tuc/${post.slug}`} className={`group flex h-full flex-col ${BOX} transition hover:-translate-y-1`}>
                  {post.coverImage ? (
                    // Ảnh bìa do quản trị tải lên kho media, kích thước tuỳ bài nên không qua next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.coverImage} alt="" className="aspect-video w-full border-b-3 border-ink object-cover" />
                  ) : (
                    <span aria-hidden className="flex aspect-video items-center justify-center border-b-3 border-ink bg-ink">
                      <Newspaper className="size-16 text-white/80" strokeWidth={1.4} />
                    </span>
                  )}
                  <span className="flex flex-1 flex-col gap-2 p-5">
                    {post.publishedAt !== null && <span className="text-sm font-semibold text-brand">{formatDate(post.publishedAt)}</span>}
                    <span className="font-condensed text-2xl leading-tight font-black uppercase italic group-hover:text-brand">{post.title}</span>
                    {post.summary && <span className="line-clamp-3 text-sm text-muted">{post.summary}</span>}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 font-condensed text-lg font-extrabold uppercase">
                      Đọc bài <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
