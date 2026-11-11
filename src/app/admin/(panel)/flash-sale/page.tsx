import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { FlashSaleForm } from "@/components/admin/FlashSaleForms";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listFlashSales } from "@/server/repo/flash-sales";

// Flash sale (nghiep-vu-ban-hang mục 9): chương trình giá theo khung giờ, giới hạn số suất.
export default function FlashSalesPage() {
  return (
    <AdminSuspense>
      <FlashSalesPageContent />
    </AdminSuspense>
  );
}

async function FlashSalesPageContent() {
  await requireStaff("coupons.manage", "/admin/flash-sale");
  const sales = await listFlashSales();
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Flash sale</h1>
        <p className="max-w-3xl text-sm text-muted">
          Giá sale chỉ áp dụng trong khung giờ và tới khi hết suất; máy chủ tính giá theo lúc khách bấm đặt hàng. Trang chủ có khối đếm ngược cho chương trình
          đang chạy hoặc sắp chạy, thẻ sản phẩm hiện nhãn giá sale.
        </p>
      </div>
      {sales.length === 0 ? (
        <Empty>Chưa có chương trình nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Chương trình</th>
                <th scope="col">Bắt đầu</th>
                <th scope="col">Kết thúc</th>
                <th scope="col">Phiên bản</th>
                <th scope="col">Đã bán</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>
                    <Link href={`/admin/flash-sale/${sale.id}`} className="font-medium hover:underline">
                      {sale.title}
                    </Link>
                  </td>
                  <td className="tabular-nums">{formatDateTime(sale.startsAt)}</td>
                  <td className="tabular-nums">{formatDateTime(sale.endsAt)}</td>
                  <td className="tabular-nums">{formatNumber(sale.itemCount)}</td>
                  <td className="tabular-nums">{formatNumber(sale.sold)}</td>
                  <td>
                    <span className={BADGE}>{sale.isActive ? "Đang bật" : "Đã tắt"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FlashSaleForm />
    </>
  );
}
