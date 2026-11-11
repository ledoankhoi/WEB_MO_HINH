import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, FilterPanel, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { AllocateButton, OfferForm } from "@/components/admin/PreorderForms";
import { formatDate, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OFFER_STATUS_LABELS } from "@/lib/preorder";
import { requireStaff } from "@/server/auth/session";
import { listVariantOptions } from "@/server/repo/products";
import { listOffers } from "@/server/repo/preorders";

// Hàng sắp về và đặt trước (docs/ke-hoach/nghiep-vu-ban-hang.md mục 10). Đợt có hàng về chờ phân bổ đứng đầu.
export default function PreordersPage(props: PageProps<"/admin/dat-truoc">) {
  return (
    <AdminSuspense>
      <PreordersPageContent {...props} />
    </AdminSuspense>
  );
}

async function PreordersPageContent({ searchParams }: PageProps<"/admin/dat-truoc">) {
  const user = await requireStaff("catalog.view", "/admin/dat-truoc");
  const params = await searchParams;
  const scope = first(params["trang-thai"]) === "da-ket-thuc" ? "ended" : "live";
  const canEdit = can(user.role, "catalog.edit");
  const canAllocate = can(user.role, "orders.fulfil");
  const [offers, variants] = await Promise.all([listOffers(scope), canEdit ? listVariantOptions() : Promise.resolve([])]);
  const live = scope === "live" ? new Set(offers.map((offer) => offer.variantId)) : new Set<string>();

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Đặt trước</h1>
        <p className="max-w-3xl text-sm text-muted">
          Mở đặt trước cho hàng sắp về: khách giữ suất (cọc hoặc trả đủ) mà không trừ tồn kho. Hàng về thì nhập kho như thường bằng phiếu nhập, rồi bấm
          “Phân bổ” để giữ hàng cho các đơn theo thứ tự đặt; khách được báo qua email và đơn chuyển sang chờ đóng gói.
        </p>
      </div>

      <FilterPanel
        active={scope === "ended" ? ["Đã kết thúc"] : []}
        clearHref="/admin/dat-truoc"
        groups={[
          {
            label: "Trạng thái",
            items: [
              { key: "", href: "/admin/dat-truoc", label: "Đang chạy", active: scope === "live" },
              { key: "da-ket-thuc", href: "/admin/dat-truoc?trang-thai=da-ket-thuc", label: "Đã kết thúc", active: scope === "ended" },
            ],
          },
        ]}
      />

      {offers.length === 0 ? (
        <Empty>{scope === "live" ? "Chưa có đợt đặt trước nào đang chạy." : "Chưa có đợt nào kết thúc."}</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Dự kiến về</th>
                <th scope="col">Cọc</th>
                <th scope="col">Suất đã đặt</th>
                <th scope="col">Chờ hàng</th>
                <th scope="col">Hàng sẵn để phân bổ</th>
                <th scope="col">Trạng thái</th>
                {canAllocate && scope === "live" && <th scope="col">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => {
                const arrived = offer.waiting > 0 && offer.available > 0;
                return (
                  <tr key={offer.id} className={arrived ? "bg-warning/5" : undefined}>
                    <td>
                      <Link href={`/admin/dat-truoc/${offer.id}`} className="font-medium hover:underline">
                        {offer.productName}
                      </Link>
                      <span className="block font-mono text-xs text-muted">
                        {offer.sku} · {offer.variantName}
                      </span>
                    </td>
                    <td className="tabular-nums">{formatDate(offer.expectedAt)}</td>
                    <td className="tabular-nums">{offer.depositPercent}%</td>
                    <td className="tabular-nums">
                      {formatNumber(offer.taken)}
                      {offer.maxQty !== null && <span className="text-muted"> / {formatNumber(offer.maxQty)}</span>}
                    </td>
                    <td className="tabular-nums">{formatNumber(offer.waiting)}</td>
                    <td className={`tabular-nums ${arrived ? "font-semibold text-warning" : ""}`}>{formatNumber(offer.available)}</td>
                    <td>
                      <span className={BADGE}>{OFFER_STATUS_LABELS[offer.status]}</span>
                    </td>
                    {canAllocate && scope === "live" && (
                      <td>{arrived ? <AllocateButton id={offer.id} label="Phân bổ" /> : <span className="text-xs text-muted">—</span>}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && scope === "live" && (
        <OfferForm
          variants={variants.filter((variant) => !live.has(variant.id)).map((variant) => ({ id: variant.id, label: `${variant.sku} · ${variant.name}` }))}
          defaultVariant={first(params["bien-the"])}
        />
      )}
    </>
  );
}
