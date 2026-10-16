import Form from "next/form";
import Link from "next/link";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { Pager, chip, first, isId, pageNumber } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  SHIPPING_STATUSES,
  SHIPPING_STATUS_LABELS,
  isOrderStatus,
  isPaymentStatus,
  isShippingStatus,
} from "@/lib/catalog";
import { formatNumber, maskPhone, parseVnDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listOrders } from "@/server/repo/orders";

const PAGE_SIZE = 20;
const DAY = 24 * 60 * 60 * 1000;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/don-hang">) {
  const user = await requireStaff("orders.view", "/admin/don-hang");
  const params = await searchParams;
  // Chỉ nhận giá trị có trong danh sách; giá trị lạ trên URL bị bỏ qua.
  const query = {
    "trang-thai": first(params["trang-thai"]),
    "van-chuyen": first(params["van-chuyen"]),
    "thanh-toan": first(params["thanh-toan"]),
    "phuong-thuc": first(params["phuong-thuc"]),
    q: first(params.q).trim().slice(0, 40),
    khach: isId(first(params.khach)) ? first(params.khach) : "",
    tu: first(params.tu),
    den: first(params.den),
  };
  const status = isOrderStatus(query["trang-thai"]) ? query["trang-thai"] : undefined;
  const shippingStatus = isShippingStatus(query["van-chuyen"]) ? query["van-chuyen"] : undefined;
  const paymentStatus = isPaymentStatus(query["thanh-toan"]) ? query["thanh-toan"] : undefined;
  const paymentMethod = PAYMENT_METHODS.find((m) => m === query["phuong-thuc"]);
  const from = parseVnDate(query.tu);
  const toStart = parseVnDate(query.den);
  const page = pageNumber(params.trang);

  const { items, total } = await listOrders({
    status,
    shippingStatus,
    paymentStatus,
    paymentMethod,
    search: query.q,
    userId: query.khach,
    from: from ?? undefined,
    // Tính cả ngày cuối: lấy tới 00:00 của ngày hôm sau.
    to: toStart === null ? undefined : toStart + DAY,
    page,
    pageSize: PAGE_SIZE,
  });

  // Tạo liên kết giữ nguyên các bộ lọc khác; đổi bộ lọc thì quay về trang 1.
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, trang: "", ...changes })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/don-hang?${search}` : "/admin/don-hang";
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Đơn hàng ({formatNumber(total)})</h1>

      <nav aria-label="Lọc theo trạng thái đơn" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ "trang-thai": "" })} className={chip(!status)}>
          Tất cả
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link key={value} href={href({ "trang-thai": value })} className={chip(status === value)}>
            {ORDER_STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      <Form action="/admin/don-hang" className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3" role="search">
        {status && <input type="hidden" name="trang-thai" value={status} />}
        {query.khach && <input type="hidden" name="khach" value={query.khach} />}
        <Field label="Mã đơn, tên hoặc số điện thoại" name="q" type="search" defaultValue={query.q} maxLength={40} />
        <SelectField label="Vận chuyển" name="van-chuyen" defaultValue={shippingStatus ?? ""}>
          <option value="">Tất cả</option>
          {SHIPPING_STATUSES.map((value) => (
            <option key={value} value={value}>
              {SHIPPING_STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Thanh toán" name="thanh-toan" defaultValue={paymentStatus ?? ""}>
          <option value="">Tất cả</option>
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {PAYMENT_STATUS_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Phương thức" name="phuong-thuc" defaultValue={paymentMethod ?? ""}>
          <option value="">Tất cả</option>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {PAYMENT_METHOD_LABELS[value]}
            </option>
          ))}
        </SelectField>
        <Field label="Từ ngày" name="tu" type="date" defaultValue={query.tu} />
        <Field label="Đến ngày" name="den" type="date" defaultValue={query.den} />
        <div className="flex items-center gap-4 sm:col-span-3">
          <Button type="submit" size="sm">
            Lọc
          </Button>
          <Link href="/admin/don-hang" className="text-sm font-medium text-brand-strong hover:underline">
            Xoá bộ lọc
          </Link>
        </div>
      </Form>

      <OrdersTable items={can(user.role, "customers.view") ? items : items.map((order) => ({ ...order, customerPhone: maskPhone(order.customerPhone) }))} />
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href({ trang: number === 1 ? "" : String(number) })} />
    </>
  );
}
