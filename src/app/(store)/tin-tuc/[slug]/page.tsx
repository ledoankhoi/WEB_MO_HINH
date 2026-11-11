import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewsArticle } from "@/components/content/NewsArticle";
import { getNewsPost } from "@/server/catalog";

type Props = PageProps<"/tin-tuc/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getNewsPost((await params).slug);
  return post ? { title: post.title, description: post.summary || undefined } : { title: "Không tìm thấy bài viết" };
}

async function NewsPostContent({ params }: Pick<Props, "params">) {
  const post = await getNewsPost((await params).slug);
  if (!post) notFound();
  return <NewsArticle post={post} />;
}

export default function NewsPostPage({ params }: Props) {
  return (
    <div className="space-y-8 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/tin-tuc" className="inline-flex items-center gap-1.5 font-condensed text-lg font-extrabold uppercase hover:text-brand">
          <ArrowLeft className="size-4" strokeWidth={2.6} aria-hidden /> Tất cả tin tức
        </Link>
      </div>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải...</p>}>
        <NewsPostContent params={params} />
      </Suspense>
    </div>
  );
}
