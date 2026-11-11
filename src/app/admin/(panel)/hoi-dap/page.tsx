import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, FilterPanel, Pager, first, pageNumber } from "@/components/admin/parts";
import { ModerateButton, StaffAnswerForm } from "@/components/admin/QuestionActions";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { QA_STATUSES, QA_STATUS_LABELS, listQuestionsForAdmin, type QaStatus } from "@/server/repo/questions";

const PAGE_SIZE = 20;
const FILTERS = [
  { key: "", label: "Cần xử lý" },
  ...QA_STATUSES.map((status) => ({ key: status, label: QA_STATUS_LABELS[status] })),
];

// Hỏi đáp trên trang sản phẩm (nghiep-vu-ban-hang mục 11): duyệt, ẩn câu hỏi và câu trả lời của khách, trả lời thay cửa hàng.
export default function QuestionsPage(props: PageProps<"/admin/hoi-dap">) {
  return (
    <AdminSuspense>
      <QuestionsPageContent {...props} />
    </AdminSuspense>
  );
}

async function QuestionsPageContent({ searchParams }: PageProps<"/admin/hoi-dap">) {
  await requireStaff("reviews.moderate", "/admin/hoi-dap");
  const params = await searchParams;
  const raw = first(params["trang-thai"]);
  const filter: "todo" | QaStatus = (QA_STATUSES as readonly string[]).includes(raw) ? (raw as QaStatus) : "todo";
  const page = pageNumber(params.trang);
  const { items, total } = await listQuestionsForAdmin(filter, page, PAGE_SIZE);
  const href = (key: string, nextPage = 1) => {
    const query = new URLSearchParams();
    if (key) query.set("trang-thai", key);
    if (nextPage > 1) query.set("trang", String(nextPage));
    const search = query.toString();
    return search ? `/admin/hoi-dap?${search}` : "/admin/hoi-dap";
  };
  const current = filter === "todo" ? "" : filter;

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Hỏi đáp</h1>
        <p className="text-sm text-muted">Câu hỏi của khách chờ duyệt; trả lời của cửa hàng hiện ngay và câu hỏi được duyệt luôn. Khách đã mua trả lời thì chờ duyệt.</p>
      </div>
      <FilterPanel
        active={current ? [QA_STATUS_LABELS[filter as QaStatus]] : []}
        clearHref="/admin/hoi-dap"
        groups={[{ label: "Lọc", items: FILTERS.map((item) => ({ key: item.key, href: href(item.key), label: item.label, active: item.key === current })) }]}
      />
      {items.length === 0 ? (
        <Empty>{filter === "todo" ? "Không còn câu hỏi nào cần xử lý." : "Không có câu hỏi nào."}</Empty>
      ) : (
        <ul className="space-y-4">
          {items.map((question) => (
            <li key={question.id} className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted">
                    <Link href={`/san-pham/${question.productSlug}`} className="font-medium text-brand-strong hover:underline">
                      {question.productName}
                    </Link>{" "}
                    · {question.userName} · {formatDateTime(question.createdAt)} · <span className={BADGE}>{QA_STATUS_LABELS[question.status]}</span>
                  </p>
                  <p className="font-medium whitespace-pre-line">{question.body}</p>
                </div>
                <div className="flex gap-2">
                  {question.status !== "approved" && <ModerateButton kind="question" id={question.id} status="approved" />}
                  {question.status !== "hidden" && <ModerateButton kind="question" id={question.id} status="hidden" />}
                </div>
              </div>
              {question.answers.map((answer) => (
                <div key={answer.id} className="ml-4 flex flex-wrap items-start justify-between gap-3 border-l-3 border-line pl-3">
                  <div>
                    <p className="whitespace-pre-line">{answer.body}</p>
                    <p className="text-xs text-muted">
                      {answer.isStaff ? "Cửa hàng" : answer.userName}
                      {answer.isBuyer && " · đã mua"} · {formatDateTime(answer.createdAt)} · <span className={BADGE}>{QA_STATUS_LABELS[answer.status]}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {answer.status !== "approved" && <ModerateButton kind="answer" id={answer.id} status="approved" />}
                    {answer.status !== "hidden" && <ModerateButton kind="answer" id={answer.id} status="hidden" />}
                  </div>
                </div>
              ))}
              {question.status !== "hidden" && <StaffAnswerForm questionId={question.id} />}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} href={(next) => href(current, next)} />
    </>
  );
}
