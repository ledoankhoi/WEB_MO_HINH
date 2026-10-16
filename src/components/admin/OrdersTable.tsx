import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { OrderSummary } from "@/lib/types";

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
            <th scope="col">Đơn</th>
            <th scope="col">Thanh toán</th>
            <th scope="col">Vận chuyển</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id}>
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
                <span className={BADGE}>{ORDER_STATUS_LABELS[order.status]}</span>
              </td>
              <td>
                {order.status === "cancelled" && order.paymentStatus === "paid" ? (
                  // Đơn đã thu tiền rồi mới huỷ: còn nợ khách một khoản hoàn (L14).
                  <span className={`${BADGE} bg-danger/10 text-danger`}>Chờ hoàn tiền</span>
                ) : (
                  <span className={BADGE}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                )}
              </td>
              <td>
                <span className={BADGE}>{SHIPPING_STATUS_LABELS[order.shippingStatus]}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
