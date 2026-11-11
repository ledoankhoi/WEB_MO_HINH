import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { OrderSummary } from "@/components/cart/CartView";
import { BuyAgainButton } from "@/components/order/BuyAgainButton";
import { CancelOrderButton } from "@/components/order/CancelOrderButton";
import { Notice } from "@/components/ui/Notice";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS } from "@/lib/catalog";
import { OrderHistory } from "@/components/order/OrderHistory";
import { OrderProgress } from "@/components/order/OrderProgress";
import { OrderReturns } from "@/components/order/OrderReturns";
import { VnpayPanel } from "@/components/order/VnpayPanel";
import { RESPONSE_MESSAGES, vnpayConfig } from "@/server/payments/vnpay";
import { formatDate, formatDateTime, formatVnd } from "@/lib/format";
import { amountDue, onlinePayable } from "@/lib/preorder";
import type { Order } from "@/lib/types";
import { buildVietQrPayload } from "@/lib/vietqr";
import { getBankAccount } from "@/server/payment";
import { OrderOptions } from "@/components/cart/WorkshopLines";
import { findOrderByToken } from "@/server/repo/orders";

// Liên kết đơn hàng chứa token bí mật: không cho công cụ tìm kiếm lập chỉ mục, không gửi Referer ra ngoài.
export const metadata: Metadata = { title: "Đơn hàng", robots: { index: false }, referrer: "no-referrer" };

// Khoản khách sắp trả, để ghi trên nút và thông tin chuyển khoản.
function dueLabel(order: Order): string {
  if (order.paymentStatus === "deposit_paid") return "phần còn lại";
  return order.depositAmount > 0 ? "tiền cọc" : "";
}

async function BankTransfer({ order }: { order: Order }) {
  const bank = getBankAccount();
  const amount = amountDue(order);
  const label = dueLabel(order);
  if (!bank) {
    return (
      <Notice tone="info">
        Cửa hàng sẽ liên hệ để gửi thông tin chuyển khoản{label ? ` ${label}` : ""} ({formatVnd(amount)}).
      </Notice>
    );
  }

  const payload = buildVietQrPayload({ bin: bank.bin, accountNumber: bank.accountNumber, amount, memo: order.code });
  const svg = await QRCode.toString(payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh SVG tạo tại chỗ, không cần bộ tối ưu ảnh */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        alt="Mã VietQR để chuyển khoản"
        width={176}
        height={176}
        className="size-44 shrink-0 rounded-lg border border-line bg-white"
      />
      <dl className="grid gap-1.5 text-sm" aria-label="Thông tin chuyển khoản">
        <div>
          <dt className="inline text-muted">Ngân hàng: </dt>
          <dd className="inline font-medium">{bank.bankName}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Số tài khoản: </dt>
          <dd className="inline font-medium">{bank.accountNumber}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Chủ tài khoản: </dt>
          <dd className="inline font-medium">{bank.accountName}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Số tiền{label ? ` (${label})` : ""}: </dt>
          <dd className="inline font-medium">{formatVnd(amount)}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Nội dung: </dt>
          <dd className="inline font-medium">{order.code}</dd>
        </div>
      </dl>
    </section>
  );
}

async function OrderDetail({ params, searchParams }: PageProps<"/don-hang/[token]">) {
  const { token } = await params;
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const order = token.length >= 16 && token.length <= 128 ? await findOrderByToken(token) : null;
  if (!order) notFound();
  // Còn trả online được (chưa trả, hoặc đã cọc mà chưa giao xong) và đơn có hẹn trả trước bằng chuyển khoản.
  const payable = onlinePayable(order);
  const bankDue =
    payable &&
    amountDue(order) > 0 &&
    (order.paymentMethod === "bank" || (order.paymentMethod === "cod" && order.paymentStatus === "unpaid" && order.depositAmount > 0));
  const preorderDates = order.items.flatMap((item) => (item.preorder && !item.preorder.allocated ? [item.preorder.expectedAt] : []));

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Đơn hàng {order.code}</h1>
        <p className="text-sm text-muted">
          Đặt lúc {formatDateTime(order.createdAt)}. Hãy lưu lại liên kết trang này để theo dõi đơn hàng.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-fg px-3 py-1 font-medium text-bg">{ORDER_STATUS_LABELS[order.status]}</span>
        <span className="rounded-full border border-line bg-surface px-3 py-1">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
        <span className="rounded-full border border-line bg-surface px-3 py-1">{SHIPPING_STATUS_LABELS[order.shippingStatus]}</span>
        <span className="rounded-full border border-line bg-surface px-3 py-1">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
      </div>

      <OrderProgress order={order} />

      {order.trackingCode && (
        <p className="text-sm">
          Mã vận đơn: <strong>{order.trackingCode}</strong> ({order.trackingCarrier})
        </p>
      )}

      {order.preorderStatus === "waiting" && order.status !== "cancelled" && (
        <Notice tone="info">
          Đơn có hàng đặt trước{preorderDates.length > 0 ? `, dự kiến về khoảng ${formatDate(Math.max(...preorderDates))}` : ""}. Cửa hàng giao một lần khi hàng về đủ và báo bạn qua email.
          {order.depositAmount > 0 && order.paymentStatus === "unpaid" && " Suất đặt trước được giữ sau khi cửa hàng nhận tiền cọc."}
        </Notice>
      )}
      {order.preorderStatus === "ready" && order.shippingStatus === "not_created" && order.status !== "cancelled" && (
        <Notice tone="success">Hàng đặt trước đã về và được giữ riêng cho bạn. Đơn đang được chuẩn bị để giao.</Notice>
      )}

      {order.paymentMethod === "vnpay" && (payable || first(query["thanh-toan"]) !== "") && (
        <VnpayPanel
          token={order.token}
          unpaid={payable}
          amountLabel={dueLabel(order) ? `${dueLabel(order)} ${formatVnd(amountDue(order))}` : undefined}
          result={first(query["thanh-toan"])}
          message={RESPONSE_MESSAGES[first(query.ma)] ?? ""}
          sandbox={vnpayConfig()?.sandbox ?? false}
        />
      )}

      {bankDue && <BankTransfer order={order} />}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {order.items.map((item, index) => (
              <li key={`${item.variantId}-${index}`} className="flex justify-between gap-4 p-4 text-sm">
                <span>
                  <Link href={`/san-pham/${item.slug}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>{" "}
                  {item.variantName !== "Bản thường" && <span className="text-muted">({item.variantName}) </span>}
                  <span className="text-muted">× {item.quantity}</span>
                  <OrderOptions options={item.options} />
                  {item.preorder && (
                    <span className="mt-1 block text-xs font-semibold text-cobalt">
                      {item.preorder.allocated ? "Đặt trước · hàng đã về" : `Đặt trước · dự kiến về ${formatDate(item.preorder.expectedAt)}`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{formatVnd(item.unitPrice * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <OrderReturns order={order} />
          <OrderHistory order={order} />
        </div>
        <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <OrderSummary totals={{ subtotal: order.subtotal, discount: order.discount, shipping: order.shippingFee, total: order.total }} couponCode={order.couponCode} bundleDiscount={order.bundleDiscount} />
          {order.depositAmount > 0 && (
            <dl className="space-y-1 border-t border-dashed border-line pt-3">
              <div className="flex justify-between">
                <dt>Tiền cọc {order.paymentStatus === "unpaid" ? "(chưa nhận)" : "(đã nhận)"}</dt>
                <dd className="tabular-nums">{formatVnd(order.depositAmount)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Còn lại {order.paymentStatus === "paid" ? "(đã trả)" : "(trả khi nhận hàng)"}</dt>
                <dd className="tabular-nums">{formatVnd(order.total - order.depositAmount)}</dd>
              </div>
            </dl>
          )}
          {order.invoice && (
            <div className="space-y-1 border-t border-line pt-4">
              <p className="font-semibold">Hoá đơn VAT</p>
              <p>
                {order.invoice.companyName} · MST {order.invoice.taxCode}
              </p>
              <p className="text-muted">
                {order.invoice.status === "issued" ? `Đã xuất hoá đơn số ${order.invoice.invoiceNo}, gửi tới ${order.invoice.invoiceEmail}.` : "Cửa hàng sẽ xuất hoá đơn sau khi đơn được thanh toán."}
              </p>
            </div>
          )}
          <div className="space-y-1 border-t border-line pt-4">
            <p className="font-semibold">Giao tới</p>
            <p>
              {order.customerName} · {order.customerPhone}
            </p>
            <p className="text-muted">
              {order.shippingAddress}, {order.shippingCity}
            </p>
            {order.note && <p className="text-muted">Ghi chú: {order.note}</p>}
          </div>
          {order.status === "pending" && <CancelOrderButton token={order.token} />}
          {(order.status === "completed" || order.shippingStatus === "delivered") && (
            <BuyAgainButton lines={order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity, cfg: item.optionsConfig }))} />
          )}
        </aside>
      </div>
    </>
  );
}

export default function OrderPage({ params, searchParams }: PageProps<"/don-hang/[token]">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải đơn hàng...</p>}>
        <OrderDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
