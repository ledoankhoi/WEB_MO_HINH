import Link from "next/link";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/catalog";
import { formatNumber, formatVnd } from "@/lib/format";
import { requireAdmin } from "@/server/auth/session";
import { getOrderStats } from "@/server/repo/orders";
import { countUsers } from "@/server/repo/users";

const card = "rounded-xl border border-line bg-surface p-5";

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [stats, customers] = await Promise.all([getOrderStats(), countUsers()]);

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Tổng quan</h1>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className={card}>
          <dt className="text-sm text-muted">Doanh thu (đơn hoàn tất)</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{formatVnd(stats.revenue)}</dd>
        </div>
        <div className={card}>
          <dt className="text-sm text-muted">Tổng số đơn</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(stats.totalOrders)}</dd>
        </div>
        <div className={card}>
          <dt className="text-sm text-muted">Khách hàng</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(customers)}</dd>
        </div>
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="theo-trang-thai" className={card}>
          <h2 id="theo-trang-thai" className="text-lg font-semibold">
            Đơn hàng theo trạng thái
          </h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {ORDER_STATUSES.map((status) => (
              <li key={status}>
                <Link href={`/admin/don-hang?trang-thai=${status}`} className="flex justify-between py-2.5 hover:text-brand-strong">
                  <span>{ORDER_STATUS_LABELS[status]}</span>
                  <span className="font-semibold tabular-nums">{formatNumber(stats.byStatus[status])}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="sap-het" className={card}>
          <h2 id="sap-het" className="text-lg font-semibold">
            Hàng sắp hết (còn từ 5 trở xuống)
          </h2>
          {stats.lowStock.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Chưa có sản phẩm nào sắp hết hàng.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {stats.lowStock.map((product) => (
                <li key={product.id}>
                  <Link href={`/admin/san-pham/${product.id}`} className="flex justify-between gap-4 py-2.5 hover:text-brand-strong">
                    <span>{product.name}</span>
                    <span className={`font-semibold tabular-nums ${product.stock === 0 ? "text-danger" : "text-warning"}`}>
                      {product.stock === 0 ? "Hết hàng" : `Còn ${product.stock}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
