import Form from "next/form";
import Link from "next/link";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, first, pageNumber } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { formatDate, formatNumber, formatVnd } from "@/lib/format";
import { maskContact, requireCustomerAccess } from "@/server/customer-access";
import { listCustomers } from "@/server/repo/users";

const PAGE_SIZE = 20;

// YC-KH-01. Vai trò viewer thấy danh sách nhưng email, số điện thoại bị che (SEC-02).
export default async function AdminCustomersPage({ searchParams }: PageProps<"/admin/khach-hang">) {
  const { masked } = await requireCustomerAccess("/admin/khach-hang");
  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 60);
  const page = pageNumber(params.trang);
  const { items, total } = await listCustomers({ q: q || undefined, page, pageSize: PAGE_SIZE });
  const customers = items.map((customer) => maskContact(customer, masked));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Khách hàng ({formatNumber(total)})</h1>
      {masked && <p className="text-sm text-muted">Bạn đang xem ở chế độ chỉ xem: email và số điện thoại được che.</p>}

      <Form action="/admin/khach-hang" className="flex max-w-xl items-end gap-3" role="search">
        <div className="flex-1">
          <Field label="Tên, email hoặc số điện thoại" name="q" type="search" defaultValue={q} maxLength={60} />
        </div>
        <Button type="submit" size="sm">
          Tìm
        </Button>
      </Form>

      {customers.length === 0 ? (
        <Empty>Không có khách hàng nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Họ và tên</th>
                <th scope="col">Email</th>
                <th scope="col">Số điện thoại</th>
                <th scope="col">Đăng ký</th>
                <th scope="col" className="text-right">Số đơn</th>
                <th scope="col" className="text-right">Đã mua</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/admin/khach-hang/${customer.id}`} className="font-medium hover:underline">
                      {customer.name}
                    </Link>
                  </td>
                  <td>{customer.email}</td>
                  <td className="whitespace-nowrap">{customer.phone || "—"}</td>
                  <td className="whitespace-nowrap text-muted">{formatDate(customer.createdAt)}</td>
                  <td className="text-right tabular-nums">{formatNumber(customer.orderCount)}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(customer.spent)}</td>
                  <td className="space-x-1.5 whitespace-nowrap">
                    {!customer.isActive && <span className={`${BADGE} bg-danger/10 text-danger`}>Đã khoá</span>}
                    {customer.marketingConsent && <span className={BADGE}>Nhận tin</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => `/admin/khach-hang?${new URLSearchParams({ ...(q && { q }), ...(number > 1 && { trang: String(number) }) })}`} />
    </>
  );
}
