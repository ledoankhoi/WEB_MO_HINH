import { notFound } from "next/navigation";
import { CustomerLockButton } from "@/components/admin/CustomerLockButton";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { BADGE, isId } from "@/components/admin/parts";
import { formatDate, formatDateTime, formatNumber, formatVnd, maskPhone, maskText } from "@/lib/format";
import { can } from "@/lib/permissions";
import { maskContact, requireCustomerAccess } from "@/server/customer-access";
import { listOrders } from "@/server/repo/orders";
import { REVIEW_STATUS_LABELS, listReviews } from "@/server/repo/reviews";
import { listCustomerAddresses, listCustomers } from "@/server/repo/users";

// YC-KH-02, 03: hồ sơ khách. Vai trò viewer thấy thông tin cá nhân đã che (SEC-02).
export default async function AdminCustomerPage({ params }: PageProps<"/admin/khach-hang/[id]">) {
  const { id } = await params;
  const { user, masked } = await requireCustomerAccess(`/admin/khach-hang/${id}`);
  const found = isId(id) ? (await listCustomers({ id, pageSize: 1 })).items[0] : undefined;
  if (!found) notFound();
  const customer = maskContact(found, masked);
  const [orders, addresses, reviews] = await Promise.all([listOrders({ userId: id, pageSize: 50 }), listCustomerAddresses(id), listReviews({ userId: id, pageSize: 50 })]);
  const shownOrders = orders.items.map((order) => (masked ? { ...order, customerPhone: maskPhone(order.customerPhone) } : order));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{customer.name}</h1>
          <p className="text-sm text-muted">
            {customer.email} · {customer.phone || "chưa có số điện thoại"} · đăng ký {formatDate(customer.createdAt)}
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className={BADGE}>{customer.isActive ? "Đang hoạt động" : "Đã khoá"}</span>
            <span className={BADGE}>
              {customer.marketingConsent ? `Đồng ý nhận tin từ ${customer.marketingConsentAt ? formatDateTime(customer.marketingConsentAt) : "?"}` : "Không nhận tin"}
            </span>
          </div>
        </div>
        {can(user.role, "customers.manage") && <CustomerLockButton id={customer.id} active={customer.isActive} />}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Số đơn</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(customer.orderCount)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-xs text-muted">Đã mua (đơn hoàn tất)</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatVnd(customer.spent)}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Địa chỉ đã dùng</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted">Chưa có đơn nào.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {addresses.map((address, index) => (
              <li key={index}>
                {address.name} · {masked ? maskPhone(address.phone) : address.phone} · {masked ? maskText(address.address) : `${address.address}, ${address.city}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Đơn hàng</h2>
        <OrdersTable items={shownOrders} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Đánh giá ({formatNumber(reviews.total)})</h2>
        {reviews.items.length === 0 ? (
          <p className="text-sm text-muted">Chưa có đánh giá nào.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {reviews.items.map((review) => (
              <li key={review.id}>
                {review.productName} · {review.rating}/5 · <span className="text-muted">{REVIEW_STATUS_LABELS[review.status]}</span>
                {review.comment && <span className="text-muted"> · {review.comment}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
