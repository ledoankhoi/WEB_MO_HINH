import Link from "next/link";
import { CouponForm } from "@/components/admin/CouponForm";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listCoupons } from "@/server/repo/coupons";
import { listTaxonomy } from "@/server/repo/taxonomy";

// QT-21: mã giảm giá. `?sua=<id>` mở form sửa. Mã đã dùng không xoá được, chỉ tắt.
export default async function CouponsPage({ searchParams }: PageProps<"/admin/ma-giam-gia">) {
  await requireStaff("coupons.manage", "/admin/ma-giam-gia");
  const [coupons, categories, params] = await Promise.all([listCoupons(), listTaxonomy("categories"), searchParams]);
  const editing = coupons.find((coupon) => coupon.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Mã giảm giá ({coupons.length})</h1>
      {coupons.length === 0 ? (
        <Empty>Chưa có mã giảm giá nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Mức giảm</th>
                <th scope="col">Điều kiện</th>
                <th scope="col">Thời gian</th>
                <th scope="col">Đã dùng</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id}>
                  <td className="font-mono font-medium">{coupon.code}</td>
                  <td>
                    {coupon.kind === "percent" ? `${coupon.value}%` : formatVnd(coupon.value)}
                    {coupon.maxDiscount !== null && <span className="text-muted"> (tối đa {formatVnd(coupon.maxDiscount)})</span>}
                  </td>
                  <td className="text-muted">
                    {coupon.minSubtotal > 0 ? `Đơn từ ${formatVnd(coupon.minSubtotal)}` : "Mọi đơn"}
                    {coupon.categoryName && ` · ${coupon.categoryName}`}
                  </td>
                  <td className="text-muted">
                    {coupon.startsAt ? formatDateTime(coupon.startsAt) : "Ngay"} → {coupon.endsAt ? formatDateTime(coupon.endsAt) : "Không hạn"}
                  </td>
                  <td className="tabular-nums">
                    {formatNumber(coupon.usedCount)}
                    {coupon.usageLimit !== null && ` / ${formatNumber(coupon.usageLimit)}`}
                  </td>
                  <td>
                    <span className={BADGE}>{coupon.isActive ? "Đang bật" : "Đã tắt"}</span>
                  </td>
                  <td>
                    <Link href={`/admin/ma-giam-gia?sua=${coupon.id}`} className="text-sm font-medium text-brand-strong hover:underline">
                      Sửa
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CouponForm
        key={editing?.id ?? "new"}
        coupon={editing}
        categories={categories.map(({ id, name, parentId }) => ({ id, name: parentId ? `— ${name}` : name }))}
      />
    </>
  );
}
