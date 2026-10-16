import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, TABLE, TABLE_WRAP, isId } from "@/components/admin/parts";
import { ThresholdForm } from "@/components/admin/WarehouseForms";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { MOVEMENT_LABELS } from "@/lib/stock";
import { requireStaff } from "@/server/auth/session";
import { listStock, stockCard } from "@/server/repo/stock-reports";

// Thẻ kho (YC-KHO-11): mọi dòng sổ kho của một biến thể, bấm được tới phiếu hoặc đơn liên quan.
export default async function StockCardPage({ params }: PageProps<"/admin/kho/the-kho/[variantId]">) {
  const { variantId } = await params;
  const user = await requireStaff("inventory.view", `/admin/kho/the-kho/${variantId}`);
  if (!isId(variantId)) notFound();
  const withCost = can(user.role, "cost.view");
  const [{ items }, card] = await Promise.all([listStock({ variantId, withCost, pageSize: 1 }), stockCard(variantId)]);
  const item = items[0];
  if (!item) notFound();

  const stats: [string, string][] = [
    ["Thực có", formatNumber(item.onHand)],
    ["Đang giữ", formatNumber(item.reserved)],
    ["Khả dụng", formatNumber(item.available)],
    ["Cách ly", formatNumber(item.quarantined)],
  ];
  if (withCost) stats.push(["Giá vốn", formatVnd(item.avgCost ?? 0)], ["Giá trị tồn", formatVnd(item.value ?? 0)]);

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Thẻ kho <span className="font-mono">{item.sku}</span>
        </h1>
        <p className="text-sm text-muted">
          <Link href={`/admin/san-pham/${item.productId}`} className="hover:underline">
            {item.name}
          </Link>
          {" · "}
          <a href={`/admin/xuat/the-kho?bien-the=${variantId}`} className="font-medium text-brand-strong hover:underline">
            Xuất CSV
          </a>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {can(user.role, "inventory.setup") && <ThresholdForm variantId={variantId} threshold={item.threshold} />}

      {card.length === 0 ? (
        <Empty>Chưa có biến động nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Thời điểm</th>
                <th scope="col">Loại</th>
                <th scope="col">Vị trí</th>
                <th scope="col" className="text-right">Tồn</th>
                <th scope="col" className="text-right">Đang giữ</th>
                <th scope="col" className="text-right">Tồn sau</th>
                <th scope="col">Chứng từ</th>
                <th scope="col">Người làm</th>
              </tr>
            </thead>
            <tbody>
              {card.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(row.createdAt)}</td>
                  <td>{MOVEMENT_LABELS[row.type] ?? row.type}</td>
                  <td className="font-mono">{row.locationCode}</td>
                  <td className={`text-right tabular-nums ${row.qtyDelta < 0 ? "text-danger" : ""}`}>{row.qtyDelta === 0 ? "" : row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta}</td>
                  <td className="text-right tabular-nums text-muted">{row.reservedDelta === 0 ? "" : row.reservedDelta > 0 ? `+${row.reservedDelta}` : row.reservedDelta}</td>
                  <td className="text-right tabular-nums">{formatNumber(row.balance)}</td>
                  <td className="whitespace-nowrap">
                    {row.documentId && (
                      <Link href={`/admin/kho/phieu/${row.documentId}`} className="font-mono hover:underline">
                        {row.documentCode}
                      </Link>
                    )}
                    {row.orderId && (
                      <Link href={`/admin/don-hang/${row.orderId}`} className="ml-2 font-mono hover:underline">
                        {row.orderCode}
                      </Link>
                    )}
                  </td>
                  <td>{row.actorName ?? "Hệ thống"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
