import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderActions } from "@/components/admin/OrderActions";
import { isId } from "@/components/admin/parts";
import { OrderSummary } from "@/components/cart/CartView";
import { OrderHistory } from "@/components/order/OrderHistory";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd, maskEmail, maskPhone, maskText } from "@/lib/format";
import { ORDER_ACTION_KEYS, ORDER_ACTIONS, canApply } from "@/lib/order-flow";
import { MOVEMENT_LABELS } from "@/lib/stock";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { findOrderById, listOrderMovements } from "@/server/repo/orders";

export default async function AdminOrderPage({ params }: PageProps<"/admin/don-hang/[id]">) {
  const { id } = await params;
  const user = await requireStaff("orders.view", `/admin/don-hang/${id}`);
  const found = isId(id) ? await findOrderById(id) : null;
  // SEC-02: người không có customers.view (vai trò viewer) thấy thông tin liên hệ đã che.
  const order = found && !can(user.role, "customers.view")
    ? { ...found, customerPhone: maskPhone(found.customerPhone), customerEmail: found.customerEmail && maskEmail(found.customerEmail), shippingAddress: maskText(found.shippingAddress) }
    : found;
  if (!order) notFound();
  const movements = await listOrderMovements(order.id);
  const shipped = -movements.filter((m) => m.type === "ship").reduce((sum, m) => sum + m.qty, 0);
  const returned = movements.filter((m) => m.type === "return_in").reduce((sum, m) => sum + m.qty, 0);
  const ordered = order.items.reduce((sum, item) => sum + item.quantity, 0);
  // Tóm tắt một câu: hàng của đơn đang ở đâu so với tồn kho.
  const stockNote =
    order.status === "cancelled" && shipped === 0
      ? "Đơn đã huỷ trước khi xuất kho: hàng giữ cho đơn đã được trả lại khả dụng."
      : shipped === 0
        ? `Đang giữ ${ordered} sản phẩm cho đơn (đã trừ khỏi Khả dụng). Thực có chỉ giảm khi bấm “Bàn giao vận chuyển”.`
        : `Đã xuất kho ${shipped} sản phẩm khi bàn giao vận chuyển (Thực có đã giảm).${returned > 0 ? ` Đã nhận về ${returned} vào khu cách ly.` : ""}`;

  // Chỉ những thao tác đúng điều kiện của đơn và đúng quyền của người xem (máy chủ vẫn kiểm tra lại).
  const allowed = ORDER_ACTION_KEYS.filter((key) => {
    const permission = ORDER_ACTIONS[key].permission;
    return permission !== null && can(user.role, permission) && canApply(key, order);
  });
  const badge = "rounded-full border border-line bg-surface px-3 py-1";

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Đơn hàng {order.code}</h1>
        <p className="text-sm text-muted">
          Đặt lúc {formatDateTime(order.createdAt)}, cập nhật lúc {formatDateTime(order.updatedAt)}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-fg px-3 py-1 font-medium text-bg">{ORDER_STATUS_LABELS[order.status]}</span>
        <span className={badge}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
        <span className={badge}>{SHIPPING_STATUS_LABELS[order.shippingStatus]}</span>
        <span className={badge}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
        {order.trackingCode && (
          <span className={badge}>
            {order.trackingCarrier}: {order.trackingCode}
          </span>
        )}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {order.items.map((item) => (
              <li key={item.variantId} className="flex justify-between gap-4 p-4 text-sm">
                <span>
                  <Link href={`/admin/san-pham/${item.productId}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>{" "}
                  <span className="text-muted">
                    ({item.variantName}, {item.sku}) × {item.quantity} · {formatVnd(item.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatVnd(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <OrderActions id={order.id} allowed={allowed} />
          <OrderHistory order={order} staff />
        </div>

        <aside className="space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <OrderSummary totals={{ subtotal: order.subtotal, discount: order.discount, shipping: order.shippingFee, total: order.total }} couponCode={order.couponCode} />
          {order.payments.length > 0 && (
            <div className="space-y-1 border-t border-line pt-4">
              <p className="font-semibold">Thanh toán</p>
              {order.payments.map((payment) => (
                <p key={payment.kind}>
                  {payment.kind === "charge" ? "Đã thu" : "Đã hoàn"} {formatVnd(payment.amount)} · {formatDateTime(payment.createdAt)}
                  {payment.reference && <span className="text-muted"> · {payment.reference}</span>}
                </p>
              ))}
            </div>
          )}
          <div className="space-y-2 border-t border-line pt-4">
            <p className="font-semibold">Kho</p>
            <p className="text-muted">{stockNote}</p>
            {movements.length > 0 && (
              <ul className="space-y-1">
                {movements.map((m, index) => (
                  <li key={index} className="flex flex-wrap gap-x-1.5">
                    <span>{MOVEMENT_LABELS[m.type] ?? m.type}</span>
                    <span className="font-mono">{m.sku}</span>
                    <span className="tabular-nums">
                      {m.qty !== 0 ? `${m.qty > 0 ? "+" : ""}${m.qty}` : `giữ ${m.reserved > 0 ? "+" : ""}${m.reserved}`}
                    </span>
                    {m.locationCode && <span className="text-muted">@ {m.locationCode}</span>}
                    {m.documentId && (
                      <Link href={`/admin/kho/phieu/${m.documentId}`} className="font-mono text-brand-strong hover:underline">
                        {m.documentCode}
                      </Link>
                    )}
                    <span className="text-muted">· {formatDateTime(m.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
