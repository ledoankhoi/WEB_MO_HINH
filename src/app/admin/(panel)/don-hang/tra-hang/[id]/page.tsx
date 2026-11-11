import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { CreateReturnDocument, DecideReturn, RefundReturn } from "@/components/admin/ReturnActions";
import { BADGE, isId } from "@/components/admin/parts";
import { PAYMENT_METHOD_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd, maskEmail, maskPhone, maskText } from "@/lib/format";
import { can } from "@/lib/permissions";
import { RETURN_REASONS, RETURN_STATUS_LABELS } from "@/lib/returns";
import { DOCUMENT_STATUS_LABELS } from "@/lib/stock";
import { requireStaff } from "@/server/auth/session";
import { findReturnRequest } from "@/server/repo/returns";

export default function ReturnRequestPage(props: PageProps<"/admin/don-hang/tra-hang/[id]">) {
  return (
    <AdminSuspense>
      <ReturnRequestContent {...props} />
    </AdminSuspense>
  );
}

const BOX = "space-y-3 rounded-xl border border-line bg-surface p-5 text-sm";

async function ReturnRequestContent({ params }: PageProps<"/admin/don-hang/tra-hang/[id]">) {
  const { id } = await params;
  const user = await requireStaff("orders.view", `/admin/don-hang/tra-hang/${id}`);
  const found = isId(id) ? await findReturnRequest(id) : null;
  if (!found) notFound();
  // Người không có customers.view thấy thông tin liên hệ và tài khoản nhận tiền đã che (như trang đơn).
  const request = can(user.role, "customers.view")
    ? found
    : { ...found, customerPhone: maskPhone(found.customerPhone), customerEmail: found.customerEmail && maskEmail(found.customerEmail), refundAccount: maskText(found.refundAccount) };
  const received = request.documentStatus === "posted";

  return (
    <>
      <div className="space-y-1">
        <Link href="/admin/don-hang/tra-hang" className="text-sm text-muted hover:underline">
          ← Trả hàng
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Yêu cầu {request.code}</h1>
        <p className="text-sm text-muted">
          Gửi lúc {formatDateTime(request.createdAt)} · Đơn{" "}
          <Link href={`/admin/don-hang/${request.orderId}`} className="font-medium text-fg hover:underline">
            {request.orderCode}
          </Link>{" "}
          ({formatVnd(request.orderTotal)}, {PAYMENT_METHOD_LABELS[request.paymentMethod]})
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={BADGE}>{RETURN_STATUS_LABELS[request.status]}</span>
        {request.documentCode && (
          <span className={BADGE}>
            Phiếu {request.documentCode}: {request.documentStatus ? DOCUMENT_STATUS_LABELS[request.documentStatus] : ""}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className={BOX}>
            <h2 className="text-base font-semibold">Khách yêu cầu</h2>
            <p>
              <strong>Lý do:</strong> {RETURN_REASONS[request.reason].label}
            </p>
            {request.note && <p className="whitespace-pre-line">{request.note}</p>}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {request.items.map((item) => (
                <li key={item.orderItemId} className="flex justify-between gap-3 px-3 py-2">
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <span className="tabular-nums">{formatVnd(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
            {request.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {request.images.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- ảnh khách tải lên Storage, xem nguyên bản */}
                    <img src={url} alt="Ảnh khách chụp hàng trả" className="aspect-square w-full rounded-lg border border-line object-cover" />
                  </a>
                ))}
              </div>
            )}
          </section>
          <section className={BOX}>
            <h2 className="text-base font-semibold">Khách hàng</h2>
            <p>
              {request.customerName} · {request.customerPhone} · {request.customerEmail || "không có email"}
            </p>
            <p>
              <strong>Nhận tiền hoàn:</strong> <span className="whitespace-pre-line">{request.refundAccount}</span>
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={BOX}>
            <h2 className="text-base font-semibold">Số tiền hoàn</h2>
            <p className="text-2xl font-bold tabular-nums">{formatVnd(request.refundAmount)}</p>
            {request.decidedAt && (
              <p className="text-muted">
                {request.status === "rejected" ? "Từ chối" : "Duyệt"} bởi {request.decidedByName ?? "?"} lúc {formatDateTime(request.decidedAt)}
              </p>
            )}
            {request.staffNote && <p>Ghi chú: {request.staffNote}</p>}
            {request.refundedAt && (
              <p className="text-success">
                Đã hoàn lúc {formatDateTime(request.refundedAt)}
                {request.refundReference && ` · ${request.refundReference}`}
              </p>
            )}
          </section>

          {request.status === "requested" && can(user.role, "orders.process") && (
            <section className={BOX}>
              <h2 className="text-base font-semibold">1. Duyệt yêu cầu</h2>
              <DecideReturn id={request.id} suggested={request.refundAmount} max={request.orderTotal} />
            </section>
          )}
          {request.status === "approved" && !received && (
            <section className={BOX}>
              <h2 className="text-base font-semibold">2. Nhận hàng về</h2>
              <p className="text-muted">Hàng trả vào khu cách ly. Ghi sổ phiếu khi đã kiểm đủ hàng khách gửi về.</p>
              {request.documentId && request.documentStatus !== "cancelled" ? (
                <Link href={`/admin/kho/phieu/${request.documentId}`} className="font-medium text-brand hover:underline">
                  Mở phiếu {request.documentCode} →
                </Link>
              ) : can(user.role, "inventory.draft") ? (
                <CreateReturnDocument id={request.id} />
              ) : (
                <p className="text-muted">Chờ nhân viên kho lập phiếu.</p>
              )}
            </section>
          )}
          {request.status === "approved" && received && (
            <section className={BOX}>
              <h2 className="text-base font-semibold">3. Hoàn tiền</h2>
              {can(user.role, "payments.manage") ? (
                <RefundReturn id={request.id} amountText={formatVnd(request.refundAmount)} />
              ) : (
                <p className="text-muted">Hàng đã về kho. Chờ kế toán hoàn tiền.</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
