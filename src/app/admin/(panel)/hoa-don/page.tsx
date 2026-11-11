import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { IssueInvoiceButton } from "@/components/admin/InvoiceButtons";
import { PAYMENT_STATUS_LABELS, isPaymentStatus } from "@/lib/catalog";
import { formatDateTime, formatVnd } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listInvoices } from "@/server/repo/invoices";

// Yêu cầu hoá đơn VAT (nghiep-vu-ban-hang mục 17): chờ xuất (đơn đã thanh toán thì cấp số được) và đã xuất.
export default function InvoicesPage(props: PageProps<"/admin/hoa-don">) {
  return (
    <AdminSuspense>
      <InvoicesPageContent {...props} />
    </AdminSuspense>
  );
}

async function InvoicesPageContent({ searchParams }: PageProps<"/admin/hoa-don">) {
  await requireStaff("payments.manage", "/admin/hoa-don");
  const status = first((await searchParams)["trang-thai"]) === "da-xuat" ? "issued" : "requested";
  const invoices = await listInvoices(status);
  const tab = (key: "requested" | "issued", label: string) => (
    <Link href={key === "requested" ? "/admin/hoa-don" : "/admin/hoa-don?trang-thai=da-xuat"} className={`rounded-full px-3 py-1 text-sm font-medium ${status === key ? "bg-fg text-bg" : "bg-raised"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Hoá đơn VAT</h1>
        <p className="max-w-3xl text-sm text-muted">
          Khách yêu cầu khi đặt hàng. Cấp số hoá đơn cho đơn đã thanh toán đủ rồi in hoặc lưu PDF gửi khách. Bản in là bản nháp nội bộ: phát hành hoá đơn điện tử
          hợp lệ cần nối nhà cung cấp hoá đơn điện tử (chưa làm).
        </p>
      </div>
      <div className="flex gap-2">
        {tab("requested", "Chờ xuất")}
        {tab("issued", "Đã xuất")}
      </div>
      {invoices.length === 0 ? (
        <Empty>{status === "requested" ? "Không có yêu cầu nào chờ xuất." : "Chưa xuất hoá đơn nào."}</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Đơn</th>
                <th scope="col">Công ty</th>
                <th scope="col">Mã số thuế</th>
                <th scope="col">Tổng</th>
                <th scope="col">Thanh toán</th>
                <th scope="col">{status === "issued" ? "Số hoá đơn" : "Yêu cầu lúc"}</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.orderId}>
                  <td className="font-mono">
                    <Link href={`/admin/don-hang/${invoice.orderId}`} className="text-brand-strong hover:underline">
                      {invoice.orderCode}
                    </Link>
                  </td>
                  <td>{invoice.companyName}</td>
                  <td className="font-mono">{invoice.taxCode}</td>
                  <td className="tabular-nums">{formatVnd(invoice.total)}</td>
                  <td>{isPaymentStatus(invoice.paymentStatus) ? PAYMENT_STATUS_LABELS[invoice.paymentStatus] : invoice.paymentStatus}</td>
                  <td className="tabular-nums">{status === "issued" ? invoice.invoiceNo : formatDateTime(invoice.createdAt)}</td>
                  <td className="flex flex-wrap gap-2">
                    {status === "requested" && invoice.paymentStatus === "paid" && <IssueInvoiceButton orderId={invoice.orderId} />}
                    <Link href={`/admin/don-hang/${invoice.orderId}/hoa-don`} className="font-medium text-brand-strong hover:underline">
                      Xem bản in
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
