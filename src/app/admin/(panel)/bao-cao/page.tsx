import Form from "next/form";
import Link from "next/link";
import { Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/catalog";
import { formatDate, formatNumber, formatVnd, parseVnDate } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { MAX_RANGE_DAYS, salesReport } from "@/server/repo/sales-reports";
import { topWishlisted } from "@/server/repo/wishlist";

const DAY = 86400 * 1000;
const percent = (value: number) => `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
// Ngày theo giờ Việt Nam dạng YYYY-MM-DD (cho ô ngày và liên kết xuất CSV).
const isoDay = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10);

// YC-BC-01, 03: báo cáo bán hàng theo khoảng ngày, xuất CSV.
export default async function ReportsPage({ searchParams }: PageProps<"/admin/bao-cao">) {
  await requireStaff("reports.view", "/admin/bao-cao");
  const params = await searchParams;
  const fromInput = parseVnDate(first(params.tu));
  const toInput = parseVnDate(first(params.den));
  const valid = fromInput !== null && toInput !== null && toInput >= fromInput && toInput - fromInput < MAX_RANGE_DAYS * DAY;
  const asked = first(params.tu) !== "" || first(params.den) !== "";
  const [report, wished] = await Promise.all([salesReport(valid ? { from: fromInput, to: toInput + DAY } : {}), topWishlisted(10)]);
  const range = `tu=${isoDay(report.from)}&den=${isoDay(report.to - DAY)}`;
  const maxRevenue = Math.max(1, ...report.daily.map((d) => d.revenue));
  const card = "rounded-xl border border-line bg-surface p-4";

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Báo cáo bán hàng</h1>
      <Form action="/admin/bao-cao" className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-5">
        <Field label="Từ ngày" name="tu" type="date" defaultValue={isoDay(report.from)} />
        <Field label="Đến ngày" name="den" type="date" defaultValue={isoDay(report.to - DAY)} />
        <Button type="submit" size="sm">
          Xem
        </Button>
      </Form>
      {asked && !valid && <Notice tone="error">Khoảng ngày không hợp lệ (tối đa {MAX_RANGE_DAYS} ngày); đang hiện 30 ngày gần nhất.</Notice>}
      <p className="text-sm text-muted">
        Từ {formatDate(report.from)} đến hết {formatDate(report.to - DAY)} (giờ Việt Nam, theo ngày đặt). Doanh thu chỉ tính đơn Hoàn tất; bán chạy
        không tính đơn đã huỷ.
      </p>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={card}>
          <dt className="text-xs text-muted">Số đơn</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(report.orders)}</dd>
        </div>
        <div className={card}>
          <dt className="text-xs text-muted">Doanh thu (đơn hoàn tất)</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatVnd(report.revenue)}</dd>
        </div>
        <div className={card}>
          <dt className="text-xs text-muted">Đơn hoàn tất</dt>
          <dd className="text-xl font-semibold tabular-nums">{formatNumber(report.byStatus.completed.count)}</dd>
        </div>
        <div className={card}>
          <dt className="text-xs text-muted">Tỷ lệ huỷ</dt>
          <dd className="text-xl font-semibold tabular-nums">{percent(report.cancelRate)}</dd>
        </div>
      </dl>

      <section aria-labelledby="theo-ngay" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="theo-ngay" className="text-lg font-semibold">
            Theo ngày
          </h2>
          <Link href={`/admin/xuat/ban-hang?${range}`} className="text-sm font-medium text-brand-strong hover:underline">
            Xuất CSV
          </Link>
        </div>
        {report.daily.length === 0 ? (
          <Empty>Không có đơn nào trong khoảng này.</Empty>
        ) : (
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Ngày</th>
                  <th scope="col">Số đơn</th>
                  <th scope="col">Hoàn tất</th>
                  <th scope="col">Đã huỷ</th>
                  <th scope="col">Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((row) => (
                  <tr key={row.day}>
                    <td>{formatDate(row.day)}</td>
                    <td className="tabular-nums">{formatNumber(row.orders)}</td>
                    <td className="tabular-nums">{formatNumber(row.completed)}</td>
                    <td className="tabular-nums">{formatNumber(row.cancelled)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="w-28 shrink-0 tabular-nums">{formatVnd(row.revenue)}</span>
                        <span aria-hidden="true" className="h-2 rounded-full bg-brand" style={{ width: `${(row.revenue / maxRevenue) * 8}rem` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="theo-trang-thai" className="space-y-3">
        <h2 id="theo-trang-thai" className="text-lg font-semibold">
          Theo trạng thái đơn
        </h2>
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Trạng thái</th>
                <th scope="col">Số đơn</th>
                <th scope="col">Tổng giá trị đơn</th>
              </tr>
            </thead>
            <tbody>
              {ORDER_STATUSES.map((status) => (
                <tr key={status}>
                  <td>{ORDER_STATUS_LABELS[status]}</td>
                  <td className="tabular-nums">{formatNumber(report.byStatus[status].count)}</td>
                  <td className="tabular-nums">{formatVnd(report.byStatus[status].total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="ban-chay" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ban-chay" className="text-lg font-semibold">
              Bán chạy (theo số lượng)
            </h2>
            <Link href={`/admin/xuat/ban-chay?${range}`} className="text-sm font-medium text-brand-strong hover:underline">
              Xuất CSV
            </Link>
          </div>
          {report.topProducts.length === 0 ? (
            <Empty>Chưa bán được sản phẩm nào.</Empty>
          ) : (
            <ol className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
              {report.topProducts.map((product) => (
                <li key={product.productId} className="flex justify-between gap-3 p-3">
                  <span>{product.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatNumber(product.quantity)} · {formatVnd(product.amount)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="yeu-thich" className="space-y-3">
          <h2 id="yeu-thich" className="text-lg font-semibold">
            Được yêu thích nhiều nhất (mọi thời điểm)
          </h2>
          {wished.length === 0 ? (
            <Empty>Chưa có sản phẩm nào được yêu thích.</Empty>
          ) : (
            <ol className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
              {wished.map((product) => (
                <li key={product.id} className="flex justify-between gap-3 p-3">
                  <span>{product.name}</span>
                  <span className="shrink-0 tabular-nums">{formatNumber(product.count)} lượt</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
