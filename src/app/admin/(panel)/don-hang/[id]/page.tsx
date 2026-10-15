import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { isId } from "@/components/admin/parts";
import { OrderSummary } from "@/components/cart/CartView";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { findOrderById } from "@/server/repo/orders";

export default async function AdminOrderPage({ params }: PageProps<"/admin/don-hang/[id]">) {
  const { id } = await params;
  await requireStaff("orders.view", `/admin/don-hang/${id}`);
  const order = isId(id) ? await findOrderById(id) : null;
  if (!order) notFound();

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Đơn hàng {order.code}</h1>
        <p className="text-sm text-muted">
          Đặt lúc {formatDateTime(order.createdAt)}, cập nhật lúc {formatDateTime(order.updatedAt)}.{" "}
          <Link href={`/don-hang/${order.token}`} className="font-medium text-brand-strong hover:underline">
            Xem trang khách thấy
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-fg px-3 py-1 font-medium text-bg">{ORDER_STATUS_LABELS[order.status]}</span>
        <span className="rounded-full border border-line bg-surface px-3 py-1">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
        <span className="rounded-full border border-line bg-surface px-3 py-1">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {order.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-4 p-4 text-sm">
                <span>
                  <Link href={`/admin/san-pham/${item.productId}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>{" "}
                  <span className="text-muted">
                    × {item.quantity} · {formatVnd(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatVnd(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <OrderActions id={order.id} status={order.status} paymentMethod={order.paymentMethod} paymentStatus={order.paymentStatus} />
        </div>

        <aside className="space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <OrderSummary totals={{ subtotal: order.subtotal, shipping: order.shippingFee, total: order.total }} />
          <div className="space-y-1 border-t border-line pt-4">
            <p className="font-semibold">Giao tới</p>
            <p>
              {order.customerName} · {order.customerPhone}
            </p>
            {order.customerEmail && <p className="break-all">{order.customerEmail}</p>}
            <p className="text-muted">
              {order.shippingAddress}, {order.shippingCity}
            </p>
            {order.note && <p className="text-muted">Ghi chú: {order.note}</p>}
            {order.userId && (
              <p>
                <Link href={`/admin/don-hang?khach=${order.userId}`} className="font-medium text-brand-strong hover:underline">
                  Các đơn khác của khách này
                </Link>
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
