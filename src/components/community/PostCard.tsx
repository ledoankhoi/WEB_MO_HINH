import Link from "next/link";
import { ProductImage } from "@/components/product/ProductCard";
import { COMMUNITY_TOPICS, type CommunityPost } from "@/lib/community";
import { formatDate, formatVnd } from "@/lib/format";
import { LikeButton } from "./PostActions";

const STATUS = { pending: "Đang chờ duyệt", hidden: "Đã bị ẩn", approved: "" } as const;
const AVATAR = ["bg-brand", "bg-cobalt", "bg-ink"];

export function Avatar({ name, id }: { name: string; id: string }) {
  const color = AVATAR[id.charCodeAt(0) % AVATAR.length];
  return (
    <span aria-hidden className={`grid size-9 shrink-0 place-items-center border-2 border-ink font-condensed text-lg font-black text-white uppercase ${color}`}>
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

// Thẻ bài trong bảng tin Cộng đồng.
export function PostCard({ post, signedIn }: { post: CommunityPost; signedIn: boolean }) {
  return (
    <article className="mb-6 break-inside-avoid border-3 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)]">
      {post.images.length > 0 && (
        <Link href={`/cong-dong/${post.id}`} className="block border-b-3 border-ink">
          {/* Ảnh khách tải lên, kích thước khác nhau nên không qua next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.images[0]} alt="" loading="lazy" className="max-h-96 w-full object-cover" />
        </Link>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2.5">
          <Avatar name={post.author.name} id={post.author.id} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{post.author.name}</p>
            <p className="text-xs text-muted">
              {formatDate(post.createdAt)} · {COMMUNITY_TOPICS[post.topic]}
            </p>
          </div>
          {post.images.length > 1 && <span className="text-xs font-semibold text-muted">{post.images.length} ảnh</span>}
        </div>
        {STATUS[post.status] && (
          <p className={`border-2 px-2 py-1 text-xs font-semibold ${post.status === "pending" ? "border-warning text-warning" : "border-danger text-danger"}`}>
            {STATUS[post.status]}
            {post.moderationNote && `: ${post.moderationNote}`}
          </p>
        )}
        <Link href={`/cong-dong/${post.id}`} className="line-clamp-6 block text-[15px] leading-relaxed whitespace-pre-line hover:text-brand">
          {post.body}
        </Link>
        {post.product && (
          <Link href={`/san-pham/${post.product.slug}`} className="flex items-center gap-2.5 border-2 border-ink bg-raised p-1.5 pr-3 hover:bg-surface">
            <span className="halftone size-11 shrink-0 border-2 border-ink">
              <ProductImage src={post.product.image} alt="" className="size-full p-0.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-condensed text-sm font-extrabold uppercase">{post.product.name}</span>
              <span className="text-xs font-semibold tabular-nums">{formatVnd(post.product.price)}</span>
            </span>
            <span className="font-condensed text-sm font-extrabold text-brand uppercase">Xem</span>
          </Link>
        )}
        {post.status === "approved" && (
          <div className="flex items-center gap-3 border-t-2 border-line pt-3">
            <LikeButton postId={post.id} liked={post.likedByViewer} likes={post.likes} signedIn={signedIn} />
            <Link href={`/cong-dong/${post.id}#binh-luan`} className="text-sm font-semibold text-muted hover:text-fg">
              {post.comments} bình luận
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
