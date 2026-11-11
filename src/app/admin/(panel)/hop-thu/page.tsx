import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { MailActions } from "@/components/admin/MailActions";
import { BADGE, Empty, TABLE, TABLE_WRAP, first, isId } from "@/components/admin/parts";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { getOutboxHtml, listOutbox, smtpConfig, type OutboxStatus } from "@/server/email/mailer";

const STATUS: Record<OutboxStatus, { label: string; tone: string }> = {
  sent: { label: "Đã gửi", tone: "bg-success/10 text-success" },
  logged: { label: "Chỉ ghi (chưa có SMTP)", tone: "bg-raised text-muted" },
  failed: { label: "Lỗi", tone: "bg-danger/10 text-danger" },
  queued: { label: "Đang chờ", tone: "bg-brand/10 text-brand-strong" },
};

const KIND: Record<string, string> = {
  password_reset: "Đặt lại mật khẩu",
  password_changed: "Đã đổi mật khẩu",
  return: "Trả hàng",
  order: "Đơn hàng",
  qa: "Hỏi đáp",
  otp: "Mã xác thực",
  test: "Thư thử",
};

export default function AdminMailPage(props: PageProps<"/admin/hop-thu">) {
  return (
    <AdminSuspense>
      <AdminMailContent {...props} />
    </AdminSuspense>
  );
}

async function AdminMailContent({ searchParams }: PageProps<"/admin/hop-thu">) {
  await requireStaff("customers.view", "/admin/hop-thu");
  const viewId = first((await searchParams).xem);
  const [rows, preview] = await Promise.all([listOutbox(100), isId(viewId) ? getOutboxHtml(viewId) : null]);
  const configured = smtpConfig() !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Hộp thư đi</h1>
        <p className="text-sm text-muted">Mọi email cửa hàng gửi cho khách (đặt lại mật khẩu, đơn hàng...). 100 thư gần nhất.</p>
      </div>

      {!configured && (
        <div className="space-y-2 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm">
          <p className="font-semibold">Chưa cấu hình gửi email thật</p>
          <p>
            Thư vẫn được tạo và lưu ở đây (trạng thái &quot;Chỉ ghi&quot;) nên kiểm thử được mọi luồng, nhưng khách chưa nhận được. Để gửi thật,
            đặt các biến môi trường <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>MAIL_FROM</code>{" "}
            (ví dụ Gmail: <code>smtp.gmail.com</code>, cổng 587, mật khẩu ứng dụng) rồi khởi động lại máy chủ.
          </p>
        </div>
      )}

      <MailActions configured={configured} />

      {preview && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Xem thư: {preview.subject}</h2>
            <Link href="/admin/hop-thu" className="text-sm text-brand-strong hover:underline">
              Đóng
            </Link>
          </div>
          {/* sandbox rỗng: không chạy script, không gửi biểu mẫu từ nội dung thư */}
          <iframe title={preview.subject} srcDoc={preview.html} sandbox="" className="h-[560px] w-full rounded-xl border border-line bg-white" />
        </section>
      )}

      {rows.length === 0 ? (
        <Empty>Chưa có thư nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th>Thời điểm</th>
                <th>Người nhận</th>
                <th>Loại</th>
                <th>Tiêu đề</th>
                <th>Trạng thái</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                  <td>{row.to}</td>
                  <td className="whitespace-nowrap">{KIND[row.kind] ?? row.kind}</td>
                  <td>{row.subject}</td>
                  <td>
                    <span className={`${BADGE} ${STATUS[row.status].tone}`}>{STATUS[row.status].label}</span>
                    {row.error && <p className="mt-1 max-w-xs text-xs text-danger">{row.error}</p>}
                    {row.attempts > 1 && <p className="mt-1 text-xs text-muted">{row.attempts} lần thử</p>}
                  </td>
                  <td>
                    <Link href={`/admin/hop-thu?xem=${row.id}`} className="text-brand-strong hover:underline">
                      Xem
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
