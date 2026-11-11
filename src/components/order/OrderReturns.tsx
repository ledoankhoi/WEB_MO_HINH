import { formatDateTime, formatVnd } from "@/lib/format";
import { RETURN_REASONS, RETURN_STATUS_LABELS } from "@/lib/returns";
import type { Order } from "@/lib/types";
import { databaseNow, listReturnsForOrder, returnEligibility, type ReturnRequest } from "@/server/repo/returns";
import { CancelReturnButton, ReturnRequestForm } from "./ReturnRequestForm";

// Khối trả hàng ở trang đơn của khách: các yêu cầu đã gửi (trạng thái) và form gửi mới khi còn hạn.
export async function OrderReturns({ order }: { order: Order }) {
  if (order.shippingStatus !== "delivered") return null;
  const [requests, now] = await Promise.all([listReturnsForOrder(order.id), databaseNow()]);
  const eligibility = await returnEligibility(order, now);
  if (requests.length === 0 && !eligibility.ok) return null;

  return (
    <section className="space-y-3" aria-label="Trả hàng">
      {requests.map((request) => (
        <ReturnCard key={request.id} request={request} token={order.token} />
      ))}
      {eligibility.ok && (
        <ReturnRequestForm
          token={order.token}
          deadlineText={formatDateTime(eligibility.deadline)}
          money={{ subtotal: order.subtotal, discount: order.discount, total: order.total }}
          lines={order.items.map((item) => ({
            lineId: item.lineId,
            label: `${item.name}${item.variantName !== "Bản thường" ? ` (${item.variantName})` : ""}`,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          }))}
        />
      )}
    </section>
  );
}

function step(request: ReturnRequest): string {
  if (request.status === "approved") {
    return request.documentStatus === "posted" ? "Cửa hàng đã nhận hàng, đang hoàn tiền." : "Vui lòng gửi hàng về cửa hàng (hướng dẫn trong email).";
  }
  return RETURN_STATUS_LABELS[request.status];
}

function ReturnCard({ request, token }: { request: ReturnRequest; token: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Yêu cầu trả hàng {request.code}</p>
        <span className="rounded-full border border-line px-3 py-0.5 text-xs">{RETURN_STATUS_LABELS[request.status]}</span>
      </div>
      <p className="text-muted">
        Gửi lúc {formatDateTime(request.createdAt)} · {RETURN_REASONS[request.reason].label}
      </p>
      <ul className="list-inside list-disc">
        {request.items.map((item) => (
          <li key={item.orderItemId}>
            {item.name} × {item.quantity}
          </li>
        ))}
      </ul>
      <p>
        {request.status === "refunded" ? "Đã hoàn" : "Số tiền hoàn"}: <strong className="tabular-nums">{formatVnd(request.refundAmount)}</strong>
        {request.status === "requested" && <span className="text-muted"> (dự kiến)</span>}
      </p>
      <p>{step(request)}</p>
      {request.staffNote && <p className="text-muted">Cửa hàng: {request.staffNote}</p>}
      {request.status === "requested" && <CancelReturnButton token={token} requestId={request.id} />}
    </div>
  );
}
