import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { Empty, TABLE, TABLE_WRAP, isId } from "@/components/admin/parts";
import { FlashItemForm, FlashSaleForm, RemoveFlashItemButton } from "@/components/admin/FlashSaleForms";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { findFlashSale } from "@/server/repo/flash-sales";
import { listVariantOptions } from "@/server/repo/products";

export default function FlashSalePage(props: PageProps<"/admin/flash-sale/[id]">) {
  return (
    <AdminSuspense>
      <FlashSalePageContent {...props} />
    </AdminSuspense>
  );
}

async function FlashSalePageContent({ params }: PageProps<"/admin/flash-sale/[id]">) {
  const { id } = await params;
  await requireStaff("coupons.manage", `/admin/flash-sale/${id}`);
  const [found, variants] = await Promise.all([isId(id) ? findFlashSale(id) : null, listVariantOptions()]);
  if (!found) notFound();
  const { sale, items } = found;
  return (
    <>
      <div className="space-y-1">
        <p className="text-sm">
          <Link href="/admin/flash-sale" className="text-muted hover:text-fg">
            ← Flash sale
          </Link>
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{sale.title}</h1>
        <p className="text-sm text-muted">
          {formatDateTime(sale.startsAt)} → {formatDateTime(sale.endsAt)} · {sale.isActive ? "Đang bật" : "Đã tắt"} · đã bán {formatNumber(sale.sold)}
        </p>
      </div>

      {items.length === 0 ? (
        <Empty>Chưa có phiên bản nào trong chương trình.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Giá thường</th>
                <th scope="col">Giá sale</th>
                <th scope="col">Đã bán / suất</th>
                <th scope="col">Tối đa mỗi đơn</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.variantId}>
                  <td>
                    <Link href={`/san-pham/${item.productSlug}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <span className="block font-mono text-xs text-muted">
                      {item.sku} · {item.variantName}
                    </span>
                  </td>
                  <td className="tabular-nums">{formatVnd(item.basePrice)}</td>
                  <td className="font-semibold text-brand tabular-nums">
                    {formatVnd(item.salePrice)} <span className="font-normal text-muted">(−{Math.round(((item.basePrice - item.salePrice) / item.basePrice) * 100)}%)</span>
                  </td>
                  <td className="tabular-nums">
                    {formatNumber(item.sold)} / {formatNumber(item.qtyLimit)}
                  </td>
                  <td className="tabular-nums">{item.maxPerOrder ?? "—"}</td>
                  <td>{item.sold === 0 ? <RemoveFlashItemButton saleId={sale.id} variantId={item.variantId} /> : <span className="text-xs text-muted">Đã có đơn</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FlashItemForm saleId={sale.id} variants={variants.map((variant) => ({ id: variant.id, label: `${variant.sku} · ${variant.name}` }))} />
      <FlashSaleForm sale={{ id: sale.id, title: sale.title, startsAt: sale.startsAt, endsAt: sale.endsAt, isActive: sale.isActive }} />
    </>
  );
}
