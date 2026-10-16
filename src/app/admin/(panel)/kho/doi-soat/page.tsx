import Link from "next/link";
import { TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { Notice } from "@/components/ui/Notice";
import { formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { findInventoryDiscrepancies } from "@/server/repo/inventory";
import { pendingWork, stockValueByCategory } from "@/server/repo/stock-reports";

// YC-KHO-18 (đối soát sổ kho với số dư), YC-KHO-12 (việc chờ xử lý), YC-KHO-15 (giá trị tồn).
export default async function ReconcilePage() {
  const user = await requireStaff("inventory.view", "/admin/kho/doi-soat");
  const withCost = can(user.role, "cost.view");
  const [issues, work, values] = await Promise.all([findInventoryDiscrepancies(), pendingWork(), withCost ? stockValueByCategory() : Promise.resolve([])]);
  const cards: [string, number, string][] = [
    ["Phiếu nháp", work.drafts, "/admin/kho/phieu?trang-thai=draft"],
    ["Phiếu chờ ghi sổ", work.submitted, "/admin/kho/phieu?trang-thai=submitted"],
    ["Đơn chờ đóng gói", work.ordersToPick, "/admin/don-hang?trang-thai=confirmed"],
    ["Đơn đang lấy hàng", work.ordersToPack, "/admin/kho/lay-hang"],
    ["Đơn chờ bàn giao", work.ordersToHandOver, "/admin/don-hang?van-chuyen=ready"],
  ];

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Đối soát kho</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Sổ kho và số dư</h2>
        {issues.length === 0 ? (
          <Notice tone="success">Khớp: số dư từng vị trí, số tổng của từng biến thể và hàng đang giữ đều bằng đúng sổ kho.</Notice>
        ) : (
          <Notice tone="error">
            <p>Có {issues.length} sai lệch. Không sửa tay số dư; báo cho quản trị viên để kiểm tra.</p>
            <ul className="mt-1 list-disc pl-4">
              {issues.slice(0, 50).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Notice>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Việc chờ xử lý</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {cards.map(([label, count, href]) => (
            <Link key={label} href={href} className="rounded-xl border border-line bg-surface p-4 hover:border-brand">
              <span className="block text-xs text-muted">{label}</span>
              <span className="text-2xl font-semibold tabular-nums">{formatNumber(count)}</span>
            </Link>
          ))}
        </div>
        {work.shortReceipts.length > 0 && (
          <p className="text-sm">
            Phiếu nhập nhận thiếu so với dự kiến:{" "}
            {work.shortReceipts.map((doc, index) => (
              <span key={doc.id}>
                {index > 0 && ", "}
                <Link href={`/admin/kho/phieu/${doc.id}`} className="font-mono font-medium text-brand-strong hover:underline">
                  {doc.code}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      {withCost && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Giá trị tồn theo danh mục (giá vốn bình quân)</h2>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Danh mục</th>
                  <th scope="col" className="text-right">Số lượng</th>
                  <th scope="col" className="text-right">Giá trị</th>
                </tr>
              </thead>
              <tbody>
                {values.map((row) => (
                  <tr key={row.category}>
                    <td>{row.category}</td>
                    <td className="text-right tabular-nums">{formatNumber(row.units)}</td>
                    <td className="text-right tabular-nums">{formatVnd(row.value)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>Tổng</td>
                  <td className="text-right tabular-nums">{formatNumber(values.reduce((sum, row) => sum + row.units, 0))}</td>
                  <td className="text-right tabular-nums">{formatVnd(values.reduce((sum, row) => sum + row.value, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
