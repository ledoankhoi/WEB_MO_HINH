import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CommentForm, LikeButton, ReportButton } from "@/components/community/PostActions";
import { Avatar } from "@/components/community/PostCard";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX } from "@/components/store/StoreKit";
import { COMMUNITY_TOPICS } from "@/lib/community";
import { formatDate, formatVnd } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { findPost, listComments } from "@/server/repo/community";

export const metadata: Metadata = { title: "Bài viết cộng đồng" };

async function Post({ params }: { params: PageProps<"/cong-dong/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[a-f0-9]{20}$/.test(id)) notFound();
  const user = await getCurrentUser();
  const post = await findPost(id, user?.id ?? null);
  if (!post) notFound();
  const comments = post.status === "approved" ? await listComments(post.id) : [];

  return (
    <article className="space-y-8">
      <Link href="/cong-dong" className="inline-flex items-center gap-1 font-condensed text-base font-bold text-muted uppercase hover:text-brand">
        <ArrowLeft className="size-4" aria-hidden /> Cộng đồng
      </Link>
      <div className={`overflow-hidden ${BOX}`}>
        {post.images.length > 0 && (
          <div className={`grid gap-1 border-b-3 border-ink bg-ink ${post.images.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {post.images.map((url, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`Ảnh ${index + 1} của bài viết`} className="max-h-[32rem] w-full bg-surface object-contain" />
            ))}
          </div>
        )}
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <Avatar name={post.author.name} id={post.author.id} />
            <div>
              <p className="font-bold">{post.author.name}</p>
              <p className="text-xs text-muted">
                {formatDate(post.createdAt)} · {COMMUNITY_TOPICS[post.topic]}
              </p>
            </div>
          </div>
          {post.status !== "approved" && (
            <p className={`border-2 px-3 py-2 text-sm font-semibold ${post.status === "pending" ? "border-warning text-warning" : "border-danger text-danger"}`}>
              {post.status === "pending" ? "Bài đang chờ duyệt, chỉ bạn thấy." : `Bài đã bị ẩn${post.moderationNote ? `: ${post.moderationNote}` : "."}`}
            </p>
          )}
          <h1 className="sr-only">Bài viết của {post.author.name}</h1>
          <p className="text-[17px] leading-relaxed whitespace-pre-line">{post.body}</p>
          {post.product && (
            <Link href={`/san-pham/${post.product.slug}`} className="flex max-w-md items-center gap-3 border-3 border-ink bg-raised p-2 pr-4 hover:bg-surface">
              <span className="halftone size-16 shrink-0 border-2 border-ink">
                <ProductImage src={post.product.image} alt="" className="size-full p-1" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-condensed text-lg leading-tight font-extrabold uppercase">{post.product.name}</span>
                <span className="font-condensed text-lg font-black italic tabular-nums">{formatVnd(post.product.price)}</span>
              </span>
            </Link>
          )}
          {post.status === "approved" && (
            <div className="flex flex-wrap items-center gap-4 border-t-2 border-line pt-4">
              <LikeButton postId={post.id} liked={post.likedByViewer} likes={post.likes} signedIn={Boolean(user)} />
              {user && user.id !== post.author.id && <ReportButton target="post" id={post.id} />}
            </div>
          )}
        </div>
      </div>

      {post.status === "approved" && (
        <section id="binh-luan" aria-labelledby="binh-luan-title" className="space-y-5">
          <h2 id="binh-luan-title" className="font-condensed text-3xl font-black uppercase italic">
            Bình luận ({comments.length})
          </h2>
          {comments.length > 0 && (
            <ul className={`divide-y-2 divide-line ${BOX}`}>
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3 p-4">
                  <Avatar name={comment.author.name} id={comment.author.id} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm">
                      <b>{comment.author.name}</b> <span className="text-xs text-muted">{formatDate(comment.createdAt)}</span>
                    </p>
                    <p className="text-[15px] whitespace-pre-line">{comment.body}</p>
                    {user && user.id !== comment.author.id && <ReportButton target="comment" id={comment.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {user ? (
            <CommentForm postId={post.id} />
          ) : (
            <p className="text-sm">
              <Link href={`/dang-nhap?next=/cong-dong/${post.id}`} className="font-bold text-brand underline">
                Đăng nhập
              </Link>{" "}
              để bình luận.
            </p>
          )}
        </section>
      )}
    </article>
  );
}

export default function PostPage({ params }: PageProps<"/cong-dong/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải bài viết...</p>}>
        <Post params={params} />
      </Suspense>
    </div>
  );
}
