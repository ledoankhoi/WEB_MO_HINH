import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, TABLE, TABLE_WRAP, isId } from "@/components/admin/parts";
import { AllocateButton, OfferForm, OfferStatusButtons } from "@/components/admin/PreorderForms";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/catalog";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OFFER_STATUS_LABELS } from "@/lib/preorder";
import { requireStaff } from "@/server/auth/session";
import { findOffer, listOfferLines } from "@/server/repo/preorders";

// Một đợt đặt trước: số liệu, thao tác (phân bổ, ngừng nhận, kết thúc), sửa đợt và các đơn theo thứ tự phân bổ. Không hiện
// thông tin liên hệ của khách (xem ở trang đơn, theo quyền của người xem).
export default function PreorderPage(props: PageProps<"/admin/dat-truoc/[id]">) {
  return (
    <AdminSuspense>
      <PreorderPageContent {...props} />
    </AdminSuspense>
  );
}

async function PreorderPageContent({ params }: PageProps<"/admin/dat-truoc/[id]">) {
  const { id } = await params;
  const user = await requireStaff("catalog.view", `/admin/dat-truoc/${id}`);
  const offer = isId(id) ? await findOffer(id) : null;
  if (!offer) notFound();
  const lines = await listOfferLines(offer.id);
  const canEdit = can(user.role, "catalog.edit") && offer.status !== "ended";
  const canAllocate = can(user.role, "orders.fulfil") && offer.status !== "ended";
  const canOpenOrders = can(user.role, "orders.view");
  const eligible = lines.filter((line) => !line.allocated && line.confirmable && (line.status === "pending" || line.status === "confirmed"));
  const stat = "rounded-xl border border-line bg-surface p-4";

  return (
    <>
      <div className="space-y-1">
        <p className="text-sm">
          <Link href="/admin/dat-truoc" className="text-muted hover:text-fg">
            ← Đặt trước
          </Link>
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{offer.productName}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="font-mono">{offer.sku}</span> · {offer.variantName} · <span className={BADGE}>{OFFER_STATUS_LABELS[offer.status]}</span>
          <Link href={`/san-pham/${offer.productSlug}`} className="text-brand-strong hover:underline">
            Xem ở cửa hàng
          </Link>
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-5">
        <div className={stat}>
          <dt className="text-xs text-muted">Dự kiến về</dt>
          <dd className="text-xl font-bold tabular-nums">{formatDate(offer.expectedAt)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">Suất đã đặt</dt>
          <dd className="text-xl font-bold tabular-nums">
            {formatNumber(offer.taken)}
            {offer.maxQty !== null && <span className="text-base font-normal text-muted"> / {formatNumber(offer.maxQty)}</span>}
          </dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">Đã phân bổ</dt>
          <dd className="text-xl font-bold tabular-nums">{formatNumber(offer.allocated)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">Đang chờ hàng</dt>
          <dd className="text-xl font-bold tabular-nums">{formatNumber(offer.waiting)}</dd>
        </div>
        <div className={stat}>
          <dt className="text-xs text-muted">Hàng sẵn để phân bổ</dt>
          <dd className={`text-xl font-bold tabular-nums ${offer.available > 0 && offer.waiting > 0 ? "text-warning" : ""}`}>{formatNumber(offer.available)}</dd>
        </div>
      </dl>

      {(canAllocate || canEdit) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-raised p-4 text-sm">
          {canAllocate && (
            <>
              <AllocateButton id={offer.id} disabled={offer.available <= 0 || eligible.length === 0} />
              <span className="text-muted">
                {eligible.length === 0
                  ? "Không có đơn nào đủ điều kiện chờ phân bổ."
                  : offer.available <= 0
                    ? `${eligible.length} đơn đang chờ. Hàng chưa về: nhập kho bằng phiếu nhập trước.`
                    : `${eligible.length} đơn đủ điều kiện (đã cọc hoặc trả, hoặc COD không cọc) sẽ được giữ hàng theo thứ tự đặt.`}
              </span>
            </>
          )}
          {canEdit && (offer.status === "open" || offer.status === "closed") && (
            <div className="ml-auto">
              <OfferStatusButtons id={offer.id} status={offer.status} />
            </div>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <Empty>Chưa có đơn nào đặt trước trong đợt này.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Đơn</th>
                <th scope="col">Đặt lúc</th>
                <th scope="col">Số lượng</th>
                <th scope="col">Đơn hàng</th>
                <th scope="col">Thanh toán</th>
                <th scope="col">Hàng</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.orderId} className={line.status === "cancelled" ? "text-muted" : undefined}>
                  <td className="tabular-nums">{index + 1}</td>
                  <td className="font-mono">
                    {canOpenOrders ? (
                      <Link href={`/admin/don-hang/${line.orderId}`} className="text-brand-strong hover:underline">
                        {line.orderCode}
                      </Link>
                    ) : (
                      line.orderCode
                    )}
                  </td>
                  <td className="tabular-nums">{formatDateTime(line.createdAt)}</td>
                  <td className="tabular-nums">{line.quantity}</td>
                  <td>{ORDER_STATUS_LABELS[line.status]}</td>
                  <td>
                    {PAYMENT_STATUS_LABELS[line.paymentStatus]}
                    {!line.confirmable && line.status !== "cancelled" && <span className="block text-xs text-warning">Chưa cọc: chưa được phân bổ</span>}
                  </td>
                  <td>
                    {line.allocated ? (
                      <span className="font-medium text-success">Đã giữ hàng</span>
                    ) : line.status === "cancelled" ? (
                      "—"
                    ) : (
                      <span className="text-muted">Chờ hàng về</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <OfferForm offer={{ id: offer.id, expectedAt: offer.expectedAt, depositPercent: offer.depositPercent, maxQty: offer.maxQty, note: offer.note }} />
      )}
    </>
  );
}
