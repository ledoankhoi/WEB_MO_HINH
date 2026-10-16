import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import type { Order, OrderEvent } from "@/lib/types";

const FIELDS: Record<OrderEvent["field"], { label: string; values: Record<string, string> }> = {
  status: { label: "Đơn hàng", values: ORDER_STATUS_LABELS },
  payment_status: { label: "Thanh toán", values: PAYMENT_STATUS_LABELS },
  shipping_status: { label: "Vận chuyển", values: SHIPPING_STATUS_LABELS },
};

// Lịch sử đổi trạng thái (order_events). Trang quản trị hiện thêm người thao tác và mã luật.
export function OrderHistory({ order, staff = false }: { order: Order; staff?: boolean }) {
  return (
    <section aria-label="Lịch sử đơn hàng" className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
      <h2 className="font-semibold">Lịch sử</h2>
      <ol className="space-y-2">
        <li className="flex flex-wrap gap-x-3">
          <span className="text-muted tabular-nums">{formatDateTime(order.createdAt)}</span>
          <span>Đặt hàng</span>
        </li>
        {order.events.map((event, index) => {
          const field = FIELDS[event.field];
          return (
            <li key={index} className="flex flex-wrap gap-x-3">
              <span className="text-muted tabular-nums">{formatDateTime(event.createdAt)}</span>
              <span>
                {field.label}: {field.values[event.from] ?? event.from} → <strong>{field.values[event.to] ?? event.to}</strong>
              </span>
              {staff && (
                <span className="text-muted">
                  {event.actorName ?? "Hệ thống"} · {event.note}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
