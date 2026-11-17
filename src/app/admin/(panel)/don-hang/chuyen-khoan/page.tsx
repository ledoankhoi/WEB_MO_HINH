import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { TransferConfirm } from "@/components/admin/TransferConfirm";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { site } from "@/config/site";
import { prepaymentDeadline } from "@/lib/bank-transfer";
import { formatDateTime, formatVnd } from "@/lib/format";
import { getBankAccount } from "@/server/payment";
import { requireStaff } from "@/server/auth/session";
import { listAwaitingTransfers } from "@/server/repo/bank-transfers";

// Đơn chờ chuyển khoản (cả đơn hoặc tiền cọc đặt trước). Kế toán đối chiếu sổ ngân hàng theo nội dung = mã đơn rồi ghi nhận.
// Đơn khách đã báo "đã chuyển khoản" lên đầu và không bị tự huỷ khi quá hạn giữ hàng.
export default function AwaitingTransfersPage() {
  return (
    <AdminSuspense>
      <AwaitingTransfersContent />
    </AdminSuspense>
  );
}

async function AwaitingTransfersContent() {
  await requireStaff("payments.manage", "/admin/don-hang/chuyen-khoan");
  const items = await listAwaitingTransfers();
  const bank = getBankAccount();

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Chờ chuyển khoản</h1>
      <p className="text-sm text-muted">
        Đối chiếu sổ ngân hàng theo <strong>nội dung chuyển khoản là mã đơn</strong> và đúng số tiền, rồi bấm “Đã nhận tiền”. Đơn chưa trả quá{" "}
        {site.payment.transferHoldHours} giờ tự huỷ (trả hàng về kho), trừ đơn khách đã báo chuyển khoản.{" "}
        {bank
          ? `Tài khoản nhận: ${bank.bankName} ${bank.accountNumber} (${bank.accountName}).`
          : "Chưa cấu hình tài khoản nhận (biến BANK_*): khách chưa chọn được chuyển khoản."}
      </p>
      {items.length === 0 ? (
        <Empty>Không có đơn nào chờ chuyển khoản.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã đơn (nội dung CK)</th>
                <th scope="col">Khách</th>
                <th scope="col" className="text-right">
                  Số tiền
                </th>
                <th scope="col">Hạn giữ hàng</th>
                <th scope="col">Khách báo</th>
                <th scope="col">Ghi nhận</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => {
                const deposit = order.depositAmount > 0;
                const amount = deposit ? order.depositAmount : order.total;
                return (
                  <tr key={order.id} className={order.claim ? "bg-warning/5" : undefined}>
                    <td>
                      <Link href={`/admin/don-hang/${order.id}`} className="font-semibold hover:underline">
                        {order.code}
                      </Link>
                      <p className="text-xs text-muted">Đặt {formatDateTime(order.createdAt)}</p>
                    </td>
                    <td>
                      {order.customerName} <span className="whitespace-nowrap text-muted">· {order.customerPhone}</span>
                    </td>
                    <td className="text-right whitespace-nowrap tabular-nums">
                      {formatVnd(amount)}
                      {deposit && <p className="text-xs text-muted">tiền cọc, tổng {formatVnd(order.total)}</p>}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(prepaymentDeadline(order))}</td>
                    <td>
                      {order.claim ? (
                        <>
                          <span className={BADGE}>Đã báo {formatDateTime(order.claim.createdAt)}</span>
                          {order.claim.note && <p className="mt-1 max-w-56 text-xs text-muted">{order.claim.note}</p>}
                        </>
                      ) : (
                        <span className="text-muted">Chưa</span>
                      )}
                    </td>
                    <td>
                      <TransferConfirm id={order.id} deposit={deposit} amountText={formatVnd(amount)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
