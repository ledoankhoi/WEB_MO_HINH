import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { isId } from "@/components/admin/parts";
import { PrintInvoiceButton } from "@/components/admin/InvoiceButtons";
import { site } from "@/config/site";
import { formatDate, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { splitVat } from "@/server/repo/invoices";
import { findOrderById } from "@/server/repo/orders";

// Bản hoá đơn GTGT của một đơn để in hoặc lưu PDF (nghiep-vu-ban-hang mục 17). Đây là bản nháp nội bộ, chưa phải hoá đơn
// điện tử hợp lệ: cần nối nhà cung cấp hoá đơn điện tử để phát hành thật.
export default function InvoicePage(props: PageProps<"/admin/don-hang/[id]/hoa-don">) {
  return (
    <AdminSuspense>
      <InvoicePageContent {...props} />
    </AdminSuspense>
  );
}

async function InvoicePageContent({ params }: PageProps<"/admin/don-hang/[id]/hoa-don">) {
  const { id } = await params;
  await requireStaff("payments.manage", `/admin/don-hang/${id}/hoa-don`);
  const order = isId(id) ? await findOrderById(id) : null;
  if (!order?.invoice) notFound();
  const invoice = order.invoice;
  const vat = splitVat(order.total, site.vatPercent);
  const cell = "border border-line px-3 py-2";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/don-hang/${order.id}`} className="text-sm text-muted hover:text-fg">
          ← Đơn {order.code}
        </Link>
        <PrintInvoiceButton />
      </div>
      <article className="mx-auto max-w-3xl space-y-6 rounded-xl border border-line bg-surface p-8 text-sm print:border-0 print:p-0">
        <header className="space-y-1 text-center">
          <p className="text-xs font-semibold tracking-wide text-danger uppercase">Bản nháp – chưa phải hoá đơn điện tử</p>
          <h1 className="text-2xl font-bold uppercase">Hoá đơn giá trị gia tăng</h1>
          <p>
            Số: <strong>{invoice.invoiceNo ?? "(chưa cấp số)"}</strong>
            {invoice.issuedAt && ` · Ngày ${formatDate(invoice.issuedAt)}`}
          </p>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="font-semibold">Đơn vị bán hàng</p>
            <p>{site.name}</p>
            <p>{site.contact.address}</p>
            <p>Điện thoại: {site.contact.phone}</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">Đơn vị mua hàng</p>
            <p>{invoice.companyName}</p>
            <p>Mã số thuế: {invoice.taxCode}</p>
            <p>{invoice.companyAddress}</p>
            <p>Email: {invoice.invoiceEmail}</p>
            <p>Theo đơn hàng {order.code}</p>
          </div>
        </section>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-raised">
              <th className={cell}>STT</th>
              <th className={`${cell} text-left`}>Tên hàng hoá</th>
              <th className={cell}>SL</th>
              <th className={`${cell} text-right`}>Đơn giá (gồm VAT)</th>
              <th className={`${cell} text-right`}>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={item.lineId}>
                <td className={`${cell} text-center`}>{index + 1}</td>
                <td className={cell}>
                  {item.name} ({item.variantName}){item.options ? ` · ${item.options}` : ""}
                </td>
                <td className={`${cell} text-center tabular-nums`}>{item.quantity}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatVnd(item.unitPrice)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatVnd(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
            {order.discount > 0 && (
              <tr>
                <td className={cell} colSpan={4}>
                  Chiết khấu (combo, mã giảm giá)
                </td>
                <td className={`${cell} text-right tabular-nums`}>−{formatVnd(order.discount)}</td>
              </tr>
            )}
            {order.shippingFee > 0 && (
              <tr>
                <td className={cell} colSpan={4}>
                  Phí vận chuyển
                </td>
                <td className={`${cell} text-right tabular-nums`}>{formatVnd(order.shippingFee)}</td>
              </tr>
            )}
          </tbody>
        </table>
        <dl className="ml-auto w-full max-w-sm space-y-1">
          <div className="flex justify-between">
            <dt>Cộng tiền hàng (chưa VAT)</dt>
            <dd className="tabular-nums">{formatVnd(vat.beforeVat)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Thuế GTGT {site.vatPercent}%</dt>
            <dd className="tabular-nums">{formatVnd(vat.vat)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-bold">
            <dt>Tổng cộng thanh toán</dt>
            <dd className="tabular-nums">{formatVnd(order.total)}</dd>
          </div>
        </dl>
      </article>
    </>
  );
}
