import Link from "next/link";
import { Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { PrintButton } from "@/components/admin/PrintButton";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listPickingOrders } from "@/server/repo/orders";

// Danh sách lấy hàng (YC-KHO-16): đơn đang xử lý chưa đóng gói, vị trí gợi ý theo Q7.
export default async function PickingPage() {
  await requireStaff("orders.fulfil", "/admin/kho/lay-hang");
  const orders = await listPickingOrders();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Lấy hàng ({orders.length} đơn)</h1>
        {orders.length > 0 && <PrintButton />}
      </div>
      <p className="text-sm text-muted print:hidden">
        Đơn đã bắt đầu đóng gói nhưng chưa xong. Lấy hàng xong thì bấm “Đóng gói xong” ở trang đơn.
      </p>

      {orders.length === 0 ? (
        <Empty>Không có đơn nào cần lấy hàng.</Empty>
      ) : (
        orders.map((order) => (
          <section key={order.id} className="space-y-2 break-inside-avoid">
            <h2 className="font-semibold">
              <Link href={`/admin/don-hang/${order.id}`} className="hover:underline">
                {order.code}
              </Link>{" "}
              <span className="text-sm font-normal text-muted">
                · {order.customerName} · {formatDateTime(order.createdAt)}
              </span>
            </h2>
            <div className={TABLE_WRAP}>
              <table className={TABLE}>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col" className="text-right">
                      Số lượng
                    </th>
                    <th scope="col">Lấy ở vị trí</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((line) => (
                    <tr key={line.sku}>
                      <td className="font-mono whitespace-nowrap">{line.sku}</td>
                      <td>{line.name}</td>
                      <td className="text-right tabular-nums">{line.quantity}</td>
                      <td>
                        {line.picks ? (
                          line.picks.map((pick) => `${pick.code} × ${pick.qty}`).join(", ")
                        ) : (
                          <span className="font-medium text-danger">Thiếu hàng ở kệ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </>
  );
}
