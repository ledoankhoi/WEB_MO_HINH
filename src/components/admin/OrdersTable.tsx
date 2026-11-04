import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { PAYMENT_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd } from "@/lib/format";
import { ACTION_STAGES, ORDER_STAGES, STAGE_TONE_CLASS, orderStage, stageNext, type OrderStageKey } from "@/lib/order-stage";
import type { OrderSummary } from "@/lib/types";

// Nhãn bước xử lý có màu: cam là việc cần làm ngay, đỏ là sự cố, xanh dương là đang chờ, xanh lá là xong.
export function StageBadge({ stage, className = "" }: { stage: OrderStageKey; className?: string }) {
  const { label, tone } = ORDER_STAGES[stage];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STAGE_TONE_CLASS[tone]} ${className}`}>{label}</span>;
}

export function OrdersTable({ items }: { items: OrderSummary[] }) {
  if (items.length === 0) return <Empty>Không có đơn hàng nào phù hợp.</Empty>;
  return (
    <div className={TABLE_WRAP}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col">Mã đơn</th>
            <th scope="col">Đặt lúc</th>
            <th scope="col">Khách hàng</th>
            <th scope="col" className="text-right">
              Tổng tiền
            </th>
            <th scope="col">Tình trạng</th>
            <th scope="col">Thanh toán</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => {
            const stage = orderStage(order);
            const next = stageNext(stage);
            // Đơn cần cửa hàng làm ngay được tô nền để nổi bật trong danh sách.
            return (
              <tr key={order.id} className={ACTION_STAGES.includes(stage) ? "bg-warning/5" : undefined}>
                <td>
                  <Link href={`/admin/don-hang/${order.id}`} className="font-semibold hover:underline">
                    {order.code}
                  </Link>
                </td>
                <td className="whitespace-nowrap text-muted">{formatDateTime(order.createdAt)}</td>
                <td>
                  {order.customerName} <span className="whitespace-nowrap text-muted">· {order.customerPhone}</span>
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(order.total)}</td>
                <td>
                  <StageBadge stage={stage} />
                  {next && <p className="mt-1 text-xs whitespace-nowrap text-muted">Tiếp theo: {next}</p>}
                </td>
                <td>
                  <span className={BADGE}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                  <p className="mt-1 text-xs text-muted">{order.paymentMethod === "cod" ? "COD" : "Chuyển khoản"}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
