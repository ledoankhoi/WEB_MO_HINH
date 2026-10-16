import { OrdersTable } from "@/components/admin/OrdersTable";
import { Pager, pageNumber } from "@/components/admin/parts";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listOrders } from "@/server/repo/orders";

const PAGE_SIZE = 20;

// Đơn đã huỷ nhưng đã thu tiền: kế toán hoàn tiền (L14) ở trang chi tiết từng đơn (YC-BH-04).
export default async function RefundPendingPage({ searchParams }: PageProps<"/admin/don-hang/cho-hoan-tien">) {
  await requireStaff("payments.manage", "/admin/don-hang/cho-hoan-tien");
  const page = pageNumber((await searchParams).trang);
  const { items, total } = await listOrders({ refundPending: true, page, pageSize: PAGE_SIZE });

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Chờ hoàn tiền ({formatNumber(total)})</h1>
      <p className="text-sm text-muted">Đơn đã huỷ sau khi khách đã chuyển khoản. Mở từng đơn để ghi nhận đã hoàn tiền.</p>
      <OrdersTable items={items} />
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => `/admin/don-hang/cho-hoan-tien${number === 1 ? "" : `?trang=${number}`}`} />
    </>
  );
}
