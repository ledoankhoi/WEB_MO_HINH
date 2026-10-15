import Link from "next/link";
import { Empty, Pager, TABLE, TABLE_WRAP, pageNumber } from "@/components/admin/parts";
import { formatDate, formatNumber, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listCustomers } from "@/server/repo/users";

const PAGE_SIZE = 20;

export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/khach-hang">) {
  await requireStaff("customers.view", "/admin/khach-hang");
  const page = pageNumber((await searchParams).trang);
  const { items, total } = await listCustomers({ page, pageSize: PAGE_SIZE });

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Khách hàng ({formatNumber(total)})</h1>

      {items.length === 0 ? (
        <Empty>Chưa có khách hàng nào đăng ký.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Họ và tên</th>
                <th scope="col">Email</th>
                <th scope="col">Số điện thoại</th>
                <th scope="col">Tỉnh / Thành phố</th>
                <th scope="col">Đăng ký</th>
                <th scope="col" className="text-right">
                  Số đơn
                </th>
                <th scope="col" className="text-right">
                  Đã mua
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((customer) => (
                <tr key={customer.id}>
                  <td className="font-medium">{customer.name}</td>
                  <td>{customer.email}</td>
                  <td className="whitespace-nowrap">{customer.phone || "—"}</td>
                  <td className="whitespace-nowrap">{customer.city || "—"}</td>
                  <td className="whitespace-nowrap text-muted">{formatDate(customer.createdAt)}</td>
                  <td className="text-right tabular-nums">
                    {customer.orderCount > 0 ? (
                      <Link href={`/admin/don-hang?khach=${customer.id}`} className="font-medium text-brand-strong hover:underline">
                        {formatNumber(customer.orderCount)}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(customer.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => (number === 1 ? "/admin/khach-hang" : `/admin/khach-hang?trang=${number}`)} />
    </>
  );
}
