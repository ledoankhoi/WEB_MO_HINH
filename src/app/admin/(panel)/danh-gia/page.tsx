import Link from "next/link";
import { ReviewButtons } from "@/components/admin/ReviewButtons";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, pageNumber } from "@/components/admin/parts";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, listReviews } from "@/server/repo/reviews";

const PAGE_SIZE = 20;

// YC-KH-05, YC-QT-08: duyệt, ẩn đánh giá; lọc theo trạng thái và số sao.
export default async function ReviewsPage({ searchParams }: PageProps<"/admin/danh-gia">) {
  await requireStaff("reviews.moderate", "/admin/danh-gia");
  const params = await searchParams;
  const status = REVIEW_STATUSES.find((value) => value === first(params["trang-thai"]));
  const rating = [1, 2, 3, 4, 5].find((value) => String(value) === first(params.sao));
  const page = pageNumber(params.trang);
  const { items, total } = await listReviews({ status, rating, page, pageSize: PAGE_SIZE });

  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ "trang-thai": status ?? "", sao: rating ? String(rating) : "", ...changes })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/danh-gia?${search}` : "/admin/danh-gia";
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Đánh giá ({formatNumber(total)})</h1>
      <nav aria-label="Lọc theo trạng thái" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ "trang-thai": "" })} className={chip(!status)}>
          Tất cả
        </Link>
        {REVIEW_STATUSES.map((value) => (
          <Link key={value} href={href({ "trang-thai": value })} className={chip(status === value)}>
            {REVIEW_STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>
      <nav aria-label="Lọc theo số sao" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ sao: "" })} className={chip(!rating)}>
          Mọi số sao
        </Link>
        {[5, 4, 3, 2, 1].map((value) => (
          <Link key={value} href={href({ sao: String(value) })} className={chip(rating === value)}>
            {value} sao
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <Empty>Không có đánh giá nào khớp bộ lọc.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Khách</th>
                <th scope="col">Số sao</th>
                <th scope="col">Nhận xét</th>
                <th scope="col">Gửi lúc</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((review) => (
                <tr key={review.id}>
                  <td>
                    <Link href={`/admin/san-pham/${review.productId}`} className="font-medium hover:underline">
                      {review.productName}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/admin/khach-hang/${review.userId}`} className="hover:underline">
                      {review.userName}
                    </Link>
                  </td>
                  <td className="tabular-nums">{review.rating}/5</td>
                  <td className="max-w-md whitespace-pre-line text-muted">{review.comment || "—"}</td>
                  <td className="text-muted">{formatDateTime(review.createdAt)}</td>
                  <td>
                    <span className={BADGE}>{REVIEW_STATUS_LABELS[review.status]}</span>
                  </td>
                  <td>
                    <ReviewButtons id={review.id} status={review.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href({ trang: number === 1 ? "" : String(number) })} />
    </>
  );
}
