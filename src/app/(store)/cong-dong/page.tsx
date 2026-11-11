import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PenLine, Trophy } from "lucide-react";
import { Avatar, PostCard } from "@/components/community/PostCard";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX, PageHero } from "@/components/store/StoreKit";
import { Notice } from "@/components/ui/Notice";
import { COMMUNITY_TOPICS, isCommunityTopic } from "@/lib/community";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/server/auth/session";
import { listFeed, listOwnPosts, listRecentReviews, listTopMembers } from "@/server/repo/community";

export const metadata: Metadata = {
  title: "Cộng đồng",
  description: "Cộng đồng người chơi mô hình ROBOTICA: khoe góc trưng bày, hỏi kinh nghiệm, đánh giá sản phẩm và góp ý cho cửa hàng.",
};

const PAGE_SIZE = 12;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
const TAB = "flex h-12 flex-1 shrink-0 items-center justify-center text-center border-r-3 border-ink px-4 font-condensed text-lg font-extrabold whitespace-nowrap uppercase last:border-r-0";

async function Feed({ searchParams }: { searchParams: PageProps<"/cong-dong">["searchParams"] }) {
  const params = await searchParams;
  const topicParam = first(params["chu-de"]);
  const reviewsTab = topicParam === "danh-gia";
  const topic = isCommunityTopic(topicParam) ? topicParam : undefined;
  const sort = first(params["sap-xep"]) === "noi-bat" ? "noi-bat" : "moi";
  const page = Math.min(Math.max(Number.parseInt(first(params.trang), 10) || 1, 1), 200);
  const user = await getCurrentUser();
  const [feed, own, top, reviews] = await Promise.all([
    reviewsTab ? null : listFeed({ topic, sort, page, pageSize: PAGE_SIZE, viewerId: user?.id ?? null }),
    user ? listOwnPosts(user.id, 6) : [],
    listTopMembers(5),
    reviewsTab ? listRecentReviews(18) : null,
  ]);
  const pendingOwn = own.filter((post) => post.status !== "approved");
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ "chu-de": topicParam, "sap-xep": sort === "moi" ? "" : sort, ...changes })) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/cong-dong?${query}` : "/cong-dong";
  };
  const tabs = [
    { key: "", label: "Tất cả" },
    ...Object.entries(COMMUNITY_TOPICS).map(([key, label]) => ({ key, label })),
    { key: "danh-gia", label: "Đánh giá sản phẩm" },
  ];

  return (
    <div className="space-y-10">
      {first(params["da-gui"]) === "1" && <Notice tone="success">Đã gửi bài! Bài sẽ hiện trong bảng tin sau khi nhân viên duyệt.</Notice>}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <nav aria-label="Chủ đề" className="flex overflow-x-auto border-3 border-ink bg-surface">
            {tabs.map((tab) => {
              const current = tab.key === topicParam || (!tab.key && !topic && !reviewsTab);
              return (
                <Link key={tab.key || "all"} href={href({ "chu-de": tab.key, trang: "" })} scroll={false} aria-current={current ? "page" : undefined} className={`${TAB} ${current ? "bg-ink text-white" : "hover:text-brand"}`}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {!reviewsTab && (
            <p className="flex gap-4 text-sm font-semibold">
              {(["moi", "noi-bat"] as const).map((value) => (
                <Link key={value} href={href({ "sap-xep": value === "moi" ? "" : value, trang: "" })} scroll={false} className={sort === value ? "text-brand underline decoration-2 underline-offset-4" : "text-muted hover:text-fg"}>
                  {value === "moi" ? "Mới nhất" : "Nổi bật 30 ngày"}
                </Link>
              ))}
            </p>
          )}

          {reviewsTab ? (
            reviews && reviews.length > 0 ? (
              <ul className="columns-1 gap-6 sm:columns-2">
                {reviews.map((review) => (
                  <li key={review.id} className={`mb-6 break-inside-avoid space-y-3 p-4 ${BOX}`}>
                    <Link href={`/san-pham/${review.product.slug}`} className="flex items-center gap-2.5 hover:text-brand">
                      <span className="halftone size-12 shrink-0 border-2 border-ink">
                        <ProductImage src={review.product.image} alt="" className="size-full p-0.5" />
                      </span>
                      <span className="font-condensed text-lg leading-tight font-extrabold uppercase">{review.product.name}</span>
                    </Link>
                    <p className="text-warning" aria-label={`${review.rating} trên 5 sao`}>
                      {"★".repeat(review.rating)}
                      <span className="text-line">{"★".repeat(5 - review.rating)}</span>
                    </p>
                    {review.comment && <p className="text-[15px] whitespace-pre-line">{review.comment}</p>}
                    <p className="text-xs text-muted">
                      {review.userName} · {formatDate(review.createdAt)} · Đã mua hàng
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`${BOX} px-6 py-12 text-center text-sm text-muted`}>Chưa có đánh giá nào được duyệt.</p>
            )
          ) : feed && feed.items.length > 0 ? (
            <>
              <div className="columns-1 gap-6 sm:columns-2 xl:columns-3">
                {feed.items.map((post) => (
                  <PostCard key={post.id} post={post} signedIn={Boolean(user)} />
                ))}
              </div>
              {feed.total > page * PAGE_SIZE && (
                <Link href={href({ trang: String(page + 1) })} scroll={false} className="mx-auto flex h-12 w-fit items-center border-3 border-ink px-6 font-condensed text-lg font-extrabold uppercase hover:bg-raised">
                  Xem thêm bài
                </Link>
              )}
            </>
          ) : (
            <p className={`${BOX} px-6 py-12 text-center`}>
              <span className="block font-condensed text-2xl font-black uppercase italic">Chưa có bài nào ở đây</span>
              <span className="text-sm text-muted">Hãy là người đầu tiên khoe mô hình của bạn!</span>
            </p>
          )}
        </div>

        <aside className="space-y-6">
          <Link href={user ? "/cong-dong/dang-bai" : "/dang-nhap?next=/cong-dong/dang-bai"} className="flex h-14 items-center justify-center gap-2 border-3 border-ink bg-brand font-condensed text-xl font-extrabold text-white uppercase shadow-[4px_4px_0_var(--color-ink)] hover:brightness-110">
            <PenLine className="size-5" strokeWidth={2.6} aria-hidden /> Đăng bài
          </Link>
          {pendingOwn.length > 0 && (
            <section aria-label="Bài của bạn" className={`space-y-2 p-4 ${BOX}`}>
              <p className="font-condensed text-lg font-extrabold uppercase">Bài của bạn</p>
              <ul className="space-y-2 text-sm">
                {pendingOwn.map((post) => (
                  <li key={post.id}>
                    <Link href={`/cong-dong/${post.id}`} className="line-clamp-2 hover:text-brand">
                      {post.body}
                    </Link>
                    <span className={`text-xs font-semibold ${post.status === "pending" ? "text-warning" : "text-danger"}`}>{post.status === "pending" ? "Đang chờ duyệt" : "Đã bị ẩn"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="tho-cua-tuan" className={`p-4 ${BOX}`}>
            <h2 id="tho-cua-tuan" className="mb-3 flex items-center gap-2 font-condensed text-xl font-black uppercase italic">
              <Trophy className="size-5" strokeWidth={2.6} aria-hidden /> Thợ của tuần
            </h2>
            {top.length === 0 ? (
              <p className="text-sm text-muted">Chưa có ai. Đăng bài để giành vị trí đầu tiên!</p>
            ) : (
              <ol className="space-y-2.5">
                {top.map((member, index) => (
                  <li key={member.id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-5 font-condensed text-lg font-black text-muted">{index + 1}</span>
                    <Avatar name={member.name} id={member.id} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{member.name}</span>
                    <span className="font-condensed font-black tabular-nums">♥ {member.likes}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="text-xs text-muted">Bài viết được nhân viên duyệt trước khi hiện. Thấy nội dung không phù hợp? Bấm &ldquo;Báo cáo&rdquo; ở bài hoặc bình luận.</p>
        </aside>
      </div>
    </div>
  );
}

export default function CommunityPage({ searchParams }: PageProps<"/cong-dong">) {
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <PageHero
        sticker="Cộng đồng ROBOTICA"
        title={
          <>
            Mô hình của người thật,
            <br />
            <span className="text-[#ffd23f]">trưng thật.</span>
          </>
        }
        intro="Khoe kệ trưng bày, kể chuyện lắp ráp, hỏi kinh nghiệm sơn, đánh giá sản phẩm và góp ý cho cửa hàng. Mỗi bài được duyệt nhận 30 xu ở trang Nhiệm vụ."
      />
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải bảng tin...</p>}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
