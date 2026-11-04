import Form from "next/form";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { StageBoard } from "@/components/admin/StageBoard";
import { ORDER_STAGES, isOrderStageKey } from "@/lib/order-stage";
import Link from "next/link";
import { FilterPanel, Pager, chip, first, isId, pageNumber } from "@/components/admin/parts";
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
import { countOrderStages, listOrders } from "@/server/repo/orders";

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
    buoc: first(params.buoc),
    "sap-xep": first(params["sap-xep"]),
  };
  const stage = isOrderStageKey(query.buoc) ? query.buoc : undefined;
  // Mặc định đơn cần xử lý ngay lên đầu; "moi-nhat" thì xếp theo thời gian đặt.
  const sort = query["sap-xep"] === "moi-nhat" ? "newest" : "priority";
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
    stage,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  const counts = await countOrderStages();

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

      <StageBoard counts={counts} active={stage} compact={stage !== "hoan-tat" && stage !== "da-huy"} href={(key) => href({ buoc: key })} />

      <FilterPanel
        active={[
          stage && ORDER_STAGES[stage].label,
          status && ORDER_STATUS_LABELS[status],
          query.q && `“${query.q}”`,
          shippingStatus && SHIPPING_STATUS_LABELS[shippingStatus],
          paymentStatus && PAYMENT_STATUS_LABELS[paymentStatus],
          paymentMethod && PAYMENT_METHOD_LABELS[paymentMethod],
          from !== null && `Từ ${query.tu}`,
          toStart !== null && `Đến ${query.den}`,
          query.khach && "Một khách hàng",
        ].filter((label): label is string => Boolean(label))}
        clearHref="/admin/don-hang"
        groups={[
          {
            label: "Trạng thái đơn",
            items: [
              { key: "", href: href({ "trang-thai": "" }), label: "Tất cả", active: !status },
              ...ORDER_STATUSES.map((value) => ({ key: value, href: href({ "trang-thai": value }), label: ORDER_STATUS_LABELS[value], active: status === value })),
            ],
          },
        ]}
      >
        <Form action="/admin/don-hang" className="grid gap-4 sm:grid-cols-3" role="search">
          {status && <input type="hidden" name="trang-thai" value={status} />}
          {query.khach && <input type="hidden" name="khach" value={query.khach} />}
          {stage && <input type="hidden" name="buoc" value={stage} />}
          {sort === "newest" && <input type="hidden" name="sap-xep" value="moi-nhat" />}
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
          </div>
        </Form>
      </FilterPanel>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Sắp xếp:</span>
        <Link href={href({ "sap-xep": "" })} className={chip(sort === "priority")}>
          Cần xử lý trước
        </Link>
        <Link href={href({ "sap-xep": "moi-nhat" })} className={chip(sort === "newest")}>
          Mới nhất
        </Link>
      </div>

      <OrdersTable items={can(user.role, "customers.view") ? items : items.map((order) => ({ ...order, customerPhone: maskPhone(order.customerPhone) }))} />
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href({ trang: number === 1 ? "" : String(number) })} />
    </>
  );
}
