import Link from "next/link";
import { MarkNotifiedButton } from "@/components/admin/StockAlertButton";
import { BADGE, Empty, FilterPanel, Pager, TABLE, TABLE_WRAP, first, pageNumber } from "@/components/admin/parts";
import { formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listStockAlerts } from "@/server/repo/stock-alerts";

const PAGE_SIZE = 30;

// "Báo khi có hàng": khách để lại email hoặc số điện thoại cho phiên bản đang hết. Cửa hàng chưa gửi email tự động,
// nên nhân viên liên hệ khách rồi bấm "Đã báo". Phiên bản đã có hàng lại đứng đầu danh sách.
export default async function StockAlertsPage({ searchParams }: PageProps<"/admin/khach-hang/cho-hang">) {
  const user = await requireStaff("customers.view", "/admin/khach-hang/cho-hang");
  const params = await searchParams;
  const status = first(params["trang-thai"]) === "da-bao" ? "notified" : "pending";
  const page = pageNumber(params.trang);
  const { items, total } = await listStockAlerts({ status, page, pageSize: PAGE_SIZE });
  const canMark = can(user.role, "customers.manage");
  const readyIds = items.filter((item) => item.stock > 0 && item.notifiedAt === null).map((item) => item.id);

  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ "trang-thai": status === "notified" ? "da-bao" : "", ...changes })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/khach-hang/cho-hang?${search}` : "/admin/khach-hang/cho-hang";
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Khách chờ hàng ({formatNumber(total)})</h1>
          <p className="text-sm text-muted">Khách bấm “Báo khi có hàng” ở sản phẩm đang hết. Liên hệ khách khi phiên bản có hàng lại rồi đánh dấu đã báo.</p>
        </div>
        {canMark && status === "pending" && readyIds.length > 0 && <MarkNotifiedButton ids={readyIds} label={`Đã báo ${readyIds.length} khách có hàng`} />}
      </div>

      <FilterPanel
        active={status === "notified" ? ["Đã báo"] : []}
        clearHref="/admin/khach-hang/cho-hang"
        groups={[
          {
            label: "Trạng thái",
            items: [
              { key: "", href: href({ "trang-thai": "" }), label: "Đang chờ", active: status === "pending" },
              { key: "da-bao", href: href({ "trang-thai": "da-bao" }), label: "Đã báo", active: status === "notified" },
            ],
          },
        ]}
      />

      {items.length === 0 ? (
        <Empty>{status === "pending" ? "Chưa có khách nào đang chờ hàng." : "Chưa báo cho khách nào."}</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Tồn hiện tại</th>
                <th scope="col">Liên hệ</th>
                <th scope="col">Khách</th>
                <th scope="col">{status === "pending" ? "Đăng ký lúc" : "Đã báo lúc"}</th>
                {canMark && status === "pending" && <th scope="col">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/admin/san-pham/${item.productId}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <p className="text-xs text-muted">
                      {item.isDefaultVariant ? "" : `${item.variantName} · `}
                      {item.sku}
                    </p>
                  </td>
                  <td>
                    {item.stock > 0 ? (
                      <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-success">
                        Đã có hàng ({formatNumber(item.stock)})
                      </span>
                    ) : (
                      <span className={BADGE}>Hết hàng</span>
                    )}
                  </td>
                  <td>
                    <a href={item.contactKind === "email" ? `mailto:${item.contact}` : `tel:${item.contact}`} className="hover:underline">
                      {item.contact}
                    </a>
                  </td>
                  <td>
                    {item.userId ? (
                      <Link href={`/admin/khach-hang/${item.userId}`} className="hover:underline">
                        {item.userName}
                      </Link>
                    ) : (
                      <span className="text-muted">Khách vãng lai</span>
                    )}
                  </td>
                  <td className="text-muted">{formatDateTime(status === "pending" ? item.createdAt : (item.notifiedAt ?? item.createdAt))}</td>
                  {canMark && status === "pending" && (
                    <td>
                      <MarkNotifiedButton ids={[item.id]} />
                    </td>
                  )}
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
