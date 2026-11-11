import { BOX } from "@/components/store/StoreKit";
import { formatDate } from "@/lib/format";
import type { NewsPost } from "@/server/repo/news";

// Một bài tin tức. Dùng chung cho trang /tin-tuc/[slug] và bản xem trước trong quản trị. Nội dung là văn bản thuần,
// giữ xuống dòng; thẻ HTML (nếu có) hiện như chữ (Q19).
export function NewsArticle({ post }: { post: Pick<NewsPost, "title" | "summary" | "body" | "coverImage" | "publishedAt"> }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-3">
        {post.publishedAt !== null && <p className="font-condensed text-lg font-extrabold tracking-[0.04em] text-brand uppercase">{formatDate(post.publishedAt)}</p>}
        <h1 className="font-condensed text-[clamp(2.25rem,5vw,3.5rem)] leading-[0.95] font-black uppercase italic">{post.title}</h1>
        {post.summary && <p className="text-lg leading-relaxed font-medium">{post.summary}</p>}
      </header>
      {post.coverImage && (
        // Ảnh bìa do quản trị tải lên kho media, kích thước tuỳ bài nên không qua next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverImage} alt="" className={`aspect-video w-full object-cover ${BOX}`} />
      )}
      <div className="text-base leading-relaxed whitespace-pre-line text-muted">{post.body}</div>
    </article>
  );
}
