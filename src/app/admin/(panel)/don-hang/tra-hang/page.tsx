import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, pageNumber } from "@/components/admin/parts";
import { formatDateTime, formatVnd } from "@/lib/format";
import { RETURN_REASONS, RETURN_STATUSES, RETURN_STATUS_LABELS, isReturnStatus } from "@/lib/returns";
import { requireStaff } from "@/server/auth/session";
import { listReturnRequests } from "@/server/repo/returns";

const PAGE_SIZE = 20;

// Yêu cầu trả hàng của khách (nghiep-vu-ban-hang mục 4). Mặc định hiện yêu cầu chờ duyệt.
export default function ReturnRequestsPage(props: PageProps<"/admin/don-hang/tra-hang">) {
  return (
    <AdminSuspense>
      <ReturnRequestsContent {...props} />
    </AdminSuspense>
  );
}

async function ReturnRequestsContent({ searchParams }: PageProps<"/admin/don-hang/tra-hang">) {
  await requireStaff("orders.view", "/admin/don-hang/tra-hang");
  const query = await searchParams;
  const raw = first(query["trang-thai"]) || "requested";
  const status = raw === "tat-ca" ? null : isReturnStatus(raw) ? raw : "requested";
  const page = pageNumber(query.trang);
  const { items, total } = await listReturnRequests({ status, page, pageSize: PAGE_SIZE });
  const href = (value: string, number = 1) => `/admin/don-hang/tra-hang?trang-thai=${value}${number > 1 ? `&trang=${number}` : ""}`;

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Trả hàng</h1>
      <p className="text-sm text-muted">
        Khách gửi yêu cầu trong 7 ngày sau khi nhận. Duyệt hoặc từ chối → kho lập phiếu hàng trả và ghi sổ khi hàng về → kế toán ghi nhận hoàn tiền.
      </p>
      <nav className="flex flex-wrap gap-2" aria-label="Lọc theo trạng thái">
        {RETURN_STATUSES.map((value) => (
          <Link key={value} href={href(value)} className={chip(status === value)}>
            {RETURN_STATUS_LABELS[value]}
          </Link>
        ))}
        <Link href={href("tat-ca")} className={chip(status === null)}>
          Tất cả
        </Link>
      </nav>
      {items.length === 0 ? (
        <Empty>Không có yêu cầu nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Gửi lúc</th>
                <th scope="col">Đơn / khách</th>
                <th scope="col">Lý do</th>
                <th scope="col" className="text-right">
                  Hoàn
                </th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((request) => (
                <tr key={request.id}>
                  <td>
                    <Link href={`/admin/don-hang/tra-hang/${request.id}`} className="font-semibold hover:underline">
                      {request.code}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(request.createdAt)}</td>
                  <td>
                    {request.orderCode} <span className="text-muted">· {request.customerName}</span>
                  </td>
                  <td>{RETURN_REASONS[request.reason].label}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(request.refundAmount)}</td>
                  <td>
                    <span className={BADGE}>{RETURN_STATUS_LABELS[request.status]}</span>
                    {request.status === "approved" && (
                      <p className="mt-1 text-xs text-muted">{request.documentStatus === "posted" ? "Hàng đã về, chờ hoàn tiền" : "Chờ nhận hàng về"}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href(status ?? "tat-ca", number)} />
    </>
  );
}
