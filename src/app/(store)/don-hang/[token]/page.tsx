import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { OrderSummary } from "@/components/cart/CartView";
import { CancelOrderButton } from "@/components/order/CancelOrderButton";
import { Notice } from "@/components/ui/Notice";
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/catalog";
import { formatDateTime, formatVnd } from "@/lib/format";
import type { Order } from "@/lib/types";
import { buildVietQrPayload } from "@/lib/vietqr";
import { getBankAccount } from "@/server/payment";
import { findOrderByToken } from "@/server/repo/orders";

// Liên kết đơn hàng chứa token bí mật: không cho công cụ tìm kiếm lập chỉ mục, không gửi Referer ra ngoài.
export const metadata: Metadata = { title: "Đơn hàng", robots: { index: false }, referrer: "no-referrer" };

async function BankTransfer({ order }: { order: Order }) {
  const bank = getBankAccount();
  if (!bank) return <Notice tone="info">Cửa hàng sẽ liên hệ để gửi thông tin chuyển khoản.</Notice>;

  const payload = buildVietQrPayload({ bin: bank.bin, accountNumber: bank.accountNumber, amount: order.total, memo: order.code });
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
          <dt className="inline text-muted">Số tiền: </dt>
          <dd className="inline font-medium">{formatVnd(order.total)}</dd>
        </div>
        <div>
          <dt className="inline text-muted">Nội dung: </dt>
          <dd className="inline font-medium">{order.code}</dd>
        </div>
      </dl>
    </section>
  );
}

async function OrderDetail({ params }: Pick<PageProps<"/don-hang/[token]">, "params">) {
  const { token } = await params;
  const order = token.length >= 16 && token.length <= 128 ? await findOrderByToken(token) : null;
  if (!order) notFound();

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
        <span className="rounded-full border border-line bg-surface px-3 py-1">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</span>
      </div>

      {order.paymentMethod === "bank" && order.paymentStatus === "unpaid" && order.status !== "cancelled" && (
        <BankTransfer order={order} />
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {order.items.map((item) => (
            <li key={item.productId} className="flex justify-between gap-4 p-4 text-sm">
              <span>
                <Link href={`/san-pham/${item.slug}`} className="font-medium hover:underline">
                  {item.name}
                </Link>{" "}
                <span className="text-muted">× {item.quantity}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatVnd(item.unitPrice * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5 text-sm">
          <OrderSummary totals={{ subtotal: order.subtotal, shipping: order.shippingFee, total: order.total }} />
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
        </aside>
      </div>
    </>
  );
}

export default function OrderPage({ params }: PageProps<"/don-hang/[token]">) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải đơn hàng...</p>}>
        <OrderDetail params={params} />
      </Suspense>
    </div>
  );
}
