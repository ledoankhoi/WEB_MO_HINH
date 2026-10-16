import Link from "next/link";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/catalog";
import { formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { stockDashboard, storeDashboard } from "@/server/repo/dashboard";
import { getOrderStats } from "@/server/repo/orders";
import { pendingWork } from "@/server/repo/stock-reports";

const card = "rounded-xl border border-line bg-surface p-5";

// Thẻ số liệu dẫn tới danh sách đã lọc sẵn (YC-QTN-07), không chỉ để trang trí.
function Stat({ label, value, href, alert = false }: { label: string; value: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className={`${card} block transition hover:border-brand`}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`mt-1 block text-2xl font-bold tabular-nums ${alert ? "text-danger" : ""}`}>{value}</span>
    </Link>
  );
}

export default async function AdminDashboardPage() {
  const user = await requireStaff("dashboard.view");
  const seesStock = can(user.role, "inventory.view");
  const seesOrders = can(user.role, "orders.view");
  const seesPayments = can(user.role, "payments.manage");
  const [stock, work, store, stats] = await Promise.all([
    seesStock ? stockDashboard() : null,
    seesStock ? pendingWork() : null,
    seesOrders ? storeDashboard() : null,
    seesOrders ? getOrderStats() : null,
  ]);

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Tổng quan</h1>
      {!seesStock && !seesOrders && <p className="text-sm text-muted">Chọn một mục ở thanh bên để bắt đầu.</p>}

      {stock && work && (
        <section aria-labelledby="kho" className="space-y-3">
          <h2 id="kho" className="text-lg font-semibold">
            Kho
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tổng có thể bán" value={formatNumber(stock.available)} href="/admin/kho" />
            <Stat label="Đơn chờ lấy hàng" value={formatNumber(work.ordersToPack)} href="/admin/kho/lay-hang" />
            <Stat label="Phiếu chờ ghi sổ" value={formatNumber(work.submitted)} href="/admin/kho/phieu?trang-thai=submitted" alert={work.submitted > 0} />
            <Stat label="SKU dưới ngưỡng / hết" value={`${formatNumber(stock.lowStockSkus)} / ${formatNumber(stock.outOfStockSkus)}`} href="/admin/kho?loc=low" alert={stock.lowStockSkus > 0} />
          </div>
        </section>
      )}

      {store && stats && (
        <section aria-labelledby="cua-hang" className="space-y-3">
          <h2 id="cua-hang" className="text-lg font-semibold">
            Cửa hàng
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Đơn hôm nay" value={formatNumber(store.ordersToday)} href="/admin/don-hang" />
            <Stat label="Doanh số hôm nay (chưa huỷ)" value={formatVnd(store.revenueToday)} href="/admin/don-hang" />
            <Stat
              label="Tỷ lệ huỷ 30 ngày"
              value={store.orders30 === 0 ? "—" : `${Math.round((store.cancelled30 / store.orders30) * 100)}%`}
              href="/admin/don-hang?trang-thai=cancelled"
            />
            <Stat label="Doanh thu đơn hoàn tất" value={formatVnd(stats.revenue)} href="/admin/don-hang?trang-thai=completed" />
            <Stat label="Chuyển khoản quá 48 giờ" value={formatNumber(store.overdueTransfers)} href="/admin/don-hang?trang-thai=pending&phuong-thuc=bank&thanh-toan=unpaid" alert={store.overdueTransfers > 0} />
            {seesPayments && <Stat label="Chờ hoàn tiền" value={formatNumber(store.refundPending)} href="/admin/don-hang/cho-hoan-tien" alert={store.refundPending > 0} />}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="theo-trang-thai" className={card}>
              <h3 id="theo-trang-thai" className="font-semibold">
                Đơn theo trạng thái
              </h3>
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

            <section aria-labelledby="ban-chay" className={card}>
              <h3 id="ban-chay" className="font-semibold">
                Bán chạy 30 ngày
              </h3>
              {store.bestSellers.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Chưa có đơn nào trong 30 ngày.</p>
              ) : (
                <ol className="mt-3 divide-y divide-line text-sm">
                  {store.bestSellers.map((item) => (
                    <li key={item.productId} className="flex justify-between gap-4 py-2.5">
                      <Link href={`/admin/san-pham/${item.productId}`} className="hover:text-brand-strong">
                        {item.name}
                      </Link>
                      <span className="font-semibold tabular-nums">{formatNumber(item.quantity)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="noi-bat-sap-het" className={card}>
              <h3 id="noi-bat-sap-het" className="font-semibold">
                Đang nổi bật nhưng sắp hết
              </h3>
              {store.featuredLowStock.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Không có.</p>
              ) : (
                <ul className="mt-3 divide-y divide-line text-sm">
                  {store.featuredLowStock.map((product) => (
                    <li key={product.id}>
                      <Link href={`/admin/san-pham/${product.id}`} className="flex justify-between gap-4 py-2.5 hover:text-brand-strong">
                        <span>{product.name}</span>
                        <span className={`font-semibold tabular-nums ${product.stock <= 0 ? "text-danger" : "text-warning"}`}>
                          {product.stock <= 0 ? "Hết hàng" : `Còn ${product.stock}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      )}
    </>
  );
}
