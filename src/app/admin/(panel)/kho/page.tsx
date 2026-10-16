import Form from "next/form";
import Link from "next/link";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, isId, pageNumber } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { STOCK_FILTERS, listStock, type StockFilter } from "@/server/repo/stock-reports";
import { listLocations } from "@/server/repo/warehouse";

const PAGE_SIZE = 50;

// YC-KHO-10, 13, 14, 15: danh sách tồn, lọc, phân trang ở máy chủ; giá vốn chỉ với cost.view (SEC-03).
export default async function StockPage({ searchParams }: PageProps<"/admin/kho">) {
  const user = await requireStaff("inventory.view", "/admin/kho");
  const params = await searchParams;
  const withCost = can(user.role, "cost.view");
  const filterParam = first(params.loc);
  const filter = filterParam in STOCK_FILTERS ? (filterParam as StockFilter) : undefined;
  const q = first(params.q).trim().slice(0, 60);
  const locationId = isId(first(params["vi-tri"])) ? first(params["vi-tri"]) : "";
  const page = pageNumber(params.trang);
  const [{ items, total }, locations] = await Promise.all([
    listStock({ q, filter, locationId: locationId || undefined, page, pageSize: PAGE_SIZE, withCost }),
    listLocations(),
  ]);

  const query = { q, loc: filter ?? "", "vi-tri": locationId };
  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, trang: "", ...changes })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/kho?${search}` : "/admin/kho";
  };
  const exportHref = `/admin/xuat/ton-kho?${new URLSearchParams(Object.entries(query).filter(([, value]) => value)).toString()}`;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Tồn kho ({formatNumber(total)} SKU)</h1>
        <a href={exportHref} className="text-sm font-medium text-brand-strong hover:underline">
          Xuất CSV
        </a>
      </div>

      <Form action="/admin/kho" className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end" role="search">
        {filter && <input type="hidden" name="loc" value={filter} />}
        <Field label="SKU, mã vạch hoặc tên" name="q" type="search" defaultValue={q} maxLength={60} />
        <SelectField label="Vị trí" name="vi-tri" defaultValue={locationId}>
          <option value="">Mọi vị trí</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code}
            </option>
          ))}
        </SelectField>
        <Button type="submit" size="sm">
          Lọc
        </Button>
      </Form>

      <nav aria-label="Lọc theo tình trạng" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ loc: "" })} className={chip(!filter)}>
          Tất cả
        </Link>
        {(Object.entries(STOCK_FILTERS) as [StockFilter, string][]).map(([value, label]) => (
          <Link key={value} href={href({ loc: value })} className={chip(filter === value)}>
            {label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <Empty>Không có SKU nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Sản phẩm</th>
                <th scope="col" className="text-right">Thực có</th>
                <th scope="col" className="text-right">Đang giữ</th>
                <th scope="col" className="text-right">Khả dụng</th>
                <th scope="col" className="text-right">Cách ly</th>
                <th scope="col" className="text-right">Tuổi tồn</th>
                {withCost && <th scope="col" className="text-right">Giá vốn</th>}
                {withCost && <th scope="col" className="text-right">Giá trị</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.variantId}>
                  <td className="font-mono whitespace-nowrap">
                    <Link href={`/admin/kho/the-kho/${item.variantId}`} className="font-semibold hover:underline">
                      {item.sku}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/admin/san-pham/${item.productId}`} className="hover:underline">
                      {item.name}
                    </Link>
                    {item.productStatus !== "published" && <span className={`${BADGE} ml-1.5`}>{item.productStatus === "draft" ? "Nháp" : "Lưu trữ"}</span>}
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(item.onHand)}</td>
                  <td className="text-right tabular-nums">{formatNumber(item.reserved)}</td>
                  <td className={`text-right tabular-nums ${item.available <= item.threshold ? "font-semibold text-danger" : ""}`}>{formatNumber(item.available)}</td>
                  <td className="text-right tabular-nums">{item.quarantined || ""}</td>
                  <td className="text-right whitespace-nowrap text-muted tabular-nums">{item.ageDays === null ? "" : `${item.ageDays} ngày`}</td>
                  {withCost && <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(item.avgCost ?? 0)}</td>}
                  {withCost && <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(item.value ?? 0)}</td>}
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
