import Form from "next/form";
import Link from "next/link";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, isId, pageNumber } from "@/components/admin/parts";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, isOrderStatus } from "@/lib/catalog";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listOrders } from "@/server/repo/orders";

const PAGE_SIZE = 20;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/don-hang">) {
  await requireStaff("orders.view", "/admin/don-hang");
  const params = await searchParams;
  const statusParam = first(params["trang-thai"]);
  const status = isOrderStatus(statusParam) ? statusParam : undefined;
  const code = first(params.ma).trim().toUpperCase().slice(0, 20);
  const userId = isId(first(params.khach)) ? first(params.khach) : "";
  const page = pageNumber(params.trang);

  const { items, total } = await listOrders({ status, code, userId, page, pageSize: PAGE_SIZE });

  // Tạo liên kết giữ nguyên các bộ lọc khác; đổi bộ lọc thì quay về trang 1.
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    const merged = { "trang-thai": status ?? "", ma: code, khach: userId, trang: "", ...changes };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/admin/don-hang?${query}` : "/admin/don-hang";
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Đơn hàng ({formatNumber(total)})</h1>

      <Form action="/admin/don-hang" className="max-w-xs" role="search">
        <label htmlFor="order-code" className="sr-only">
          Tìm theo mã đơn
        </label>
        <input
          id="order-code"
          name="ma"
          type="search"
          defaultValue={code}
          maxLength={20}
          placeholder="Tìm theo mã đơn, ví dụ RB2K7M9XQP"
          className="h-11 w-full rounded-full border border-line bg-surface px-4 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
        />
      </Form>

      <nav aria-label="Lọc theo trạng thái" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ "trang-thai": "" })} className={chip(!status)}>
          Tất cả
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link key={value} href={href({ "trang-thai": value })} className={chip(status === value)}>
            {ORDER_STATUS_LABELS[value]}
          </Link>
        ))}
        {(code || userId) && (
          <Link href="/admin/don-hang" className="self-center px-2 text-sm font-medium whitespace-nowrap text-brand-strong hover:underline">
            Xoá bộ lọc
          </Link>
        )}
      </nav>

      {items.length === 0 ? (
        <Empty>Không có đơn hàng nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã đơn</th>
                <th scope="col">Đặt lúc</th>
                <th scope="col">Khách hàng</th>
                <th scope="col" className="text-right">
                  Tổng tiền
                </th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thanh toán</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/admin/don-hang/${order.id}`} className="font-semibold hover:underline">
                      {order.code}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(order.createdAt)}</td>
                  <td>
                    {order.customerName} <span className="whitespace-nowrap text-muted">· {order.customerPhone}</span>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(order.total)}</td>
                  <td>
                    <span className={BADGE}>{ORDER_STATUS_LABELS[order.status]}</span>
                  </td>
                  <td>
                    {order.status === "cancelled" && order.paymentStatus === "paid" ? (
                      // Đơn đã thu tiền rồi mới huỷ: còn nợ khách một khoản hoàn.
                      <span className={`${BADGE} bg-danger/10 text-danger`}>Chờ hoàn tiền</span>
                    ) : (
                      <span className={BADGE}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href({ trang: number === 1 ? "" : String(number) })} />
    </>
  );
}
