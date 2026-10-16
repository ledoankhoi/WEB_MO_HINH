import { QuarantineActions } from "@/components/admin/DocumentEditor";
import { Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listQuarantineStock } from "@/server/repo/warehouse";

// YC-KHO-09: hàng hoàn, hàng lỗi khi nhận đang chờ kiểm tra. Không bán được cho tới khi chuyển về kệ hàng.
export default async function QuarantinePage() {
  const user = await requireStaff("inventory.view", "/admin/kho/cach-ly");
  const rows = await listQuarantineStock();
  const canDraft = can(user.role, "inventory.draft");

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Hàng cách ly ({formatNumber(rows.reduce((sum, row) => sum + row.qty, 0))})</h1>
      <p className="text-sm text-muted">
        Kiểm tra từng món rồi chọn: bán lại được (tạo phiếu chuyển về kệ hàng) hoặc huỷ hàng (tạo phiếu xuất hư hỏng). Phiếu tạo ra ở trạng thái nháp, cần gửi và ghi sổ như mọi phiếu khác.
      </p>
      {rows.length === 0 ? (
        <Empty>Không có hàng nào đang cách ly.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Vị trí</th>
                <th scope="col" className="text-right">
                  Số lượng
                </th>
                {canDraft && <th scope="col">Xử lý</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.variantId}-${row.locationId}`}>
                  <td className="font-mono whitespace-nowrap">{row.sku}</td>
                  <td>{row.name}</td>
                  <td className="font-mono">{row.locationCode}</td>
                  <td className="text-right tabular-nums">{formatNumber(row.qty)}</td>
                  {canDraft && (
                    <td>
                      <QuarantineActions variantId={row.variantId} locationId={row.locationId} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
