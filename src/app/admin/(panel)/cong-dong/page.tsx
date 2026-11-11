import Link from "next/link";
import { CommentModerationButton, DismissReportButton, PostModerationButtons } from "@/components/admin/CommunityModeration";
import { BADGE, Empty, Pager, first, pageNumber } from "@/components/admin/parts";
import { COMMUNITY_TOPICS, REPORT_REASONS, isReportReason } from "@/lib/community";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listComments, listForModeration, listOpenReports } from "@/server/repo/community";
import { AdminSuspense } from "@/components/admin/AdminSuspense";

const PAGE_SIZE = 10;
const TABS = [
  { key: "pending", label: "Chờ duyệt" },
  { key: "reported", label: "Bị báo cáo" },
  { key: "approved", label: "Đã duyệt" },
  { key: "hidden", label: "Đã ẩn" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Kiểm duyệt Cộng đồng (/cong-dong): duyệt hoặc ẩn bài, ẩn bình luận, xử lý báo cáo. Quyền community.moderate.
export default function CommunityModerationPage(props: PageProps<"/admin/cong-dong">) {
  return (
    <AdminSuspense>
      <CommunityModerationPageContent {...props} />
    </AdminSuspense>
  );
}

async function CommunityModerationPageContent({ searchParams }: PageProps<"/admin/cong-dong">) {
  await requireStaff("community.moderate", "/admin/cong-dong");
  const params = await searchParams;
  const tab: Tab = TABS.find((item) => item.key === first(params.tab))?.key ?? "pending";
  const page = pageNumber(params.trang);
  const { items, total } = await listForModeration(tab, page, PAGE_SIZE);
  const details = await Promise.all(items.map(async (post) => ({ reports: await listOpenReports(post.id), comments: await listComments(post.id, true) })));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Cộng đồng</h1>
      <nav aria-label="Lọc bài" className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "pending" ? "/admin/cong-dong" : `/admin/cong-dong?tab=${item.key}`}
            aria-current={item.key === tab ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium ${item.key === tab ? "border-fg bg-fg text-bg" : "border-line hover:border-fg/30"}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <Empty>Không có bài nào ở mục này.</Empty>
      ) : (
        <ul className="space-y-4">
          {items.map((post, index) => {
            const { reports, comments } = details[index];
            return (
              <li key={post.id} className="space-y-3 rounded-xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm">
                      <Link href={`/admin/khach-hang/${post.author.id}`} className="font-semibold hover:underline">
                        {post.author.name}
                      </Link>{" "}
                      <span className="text-muted">
                        · {formatDateTime(post.createdAt)} · {COMMUNITY_TOPICS[post.topic]}
                      </span>{" "}
                      {post.openReports > 0 && <span className={`${BADGE} bg-danger/10 text-danger`}>{post.openReports} báo cáo</span>}
                    </p>
                    <p className="max-w-3xl text-sm whitespace-pre-line">{post.body}</p>
                    {post.product && <p className="text-xs text-muted">Gắn sản phẩm: {post.product.name}</p>}
                    {post.images.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {post.images.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="size-24 rounded-lg border border-line object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    {post.moderationNote && <p className="text-xs text-muted">Ghi chú kiểm duyệt: {post.moderationNote}</p>}
                  </div>
                  <div className="w-64 shrink-0">
                    <PostModerationButtons id={post.id} status={post.status} />
                  </div>
                </div>

                {reports.length > 0 && (
                  <div className="space-y-1.5 rounded-lg bg-danger/5 p-3">
                    <p className="text-xs font-semibold text-danger">Báo cáo đang mở</p>
                    {reports.map((report) => (
                      <div key={report.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span>
                          {report.reporter} · {isReportReason(report.reason) ? REPORT_REASONS[report.reason] : report.reason} · {formatDateTime(report.createdAt)}
                          {report.commentBody && <span className="text-muted"> · bình luận: “{report.commentBody}”</span>}
                        </span>
                        <DismissReportButton id={report.id} />
                      </div>
                    ))}
                  </div>
                )}

                {comments.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">{comments.length} bình luận</summary>
                    <ul className="mt-2 space-y-1.5">
                      {comments.map((comment) => (
                        <li key={comment.id} className={`flex flex-wrap items-center gap-2 ${comment.status === "hidden" ? "text-muted line-through" : ""}`}>
                          <b>{comment.author.name}:</b> {comment.body}
                          <CommentModerationButton id={comment.id} status={comment.status} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => `/admin/cong-dong?${new URLSearchParams({ ...(tab === "pending" ? {} : { tab }), ...(number > 1 ? { trang: String(number) } : {}) })}`} />
    </>
  );
}
