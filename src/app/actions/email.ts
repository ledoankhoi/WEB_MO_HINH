"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/types";
import { retryFailedMail, sendMail, smtpConfig } from "@/server/email/mailer";
import { layout } from "@/server/email/templates";
import { writeAudit } from "@/server/repo/audit";
import { FORBIDDEN, staffWith } from "@/server/staff-action";

// Hộp thư đi ở /admin/hop-thu (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 1).

export async function retryMailAction(): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  if (!smtpConfig()) return { message: "Chưa cấu hình SMTP nên chưa gửi được thư thật (xem hướng dẫn trên trang)." };
  const { sent, failed } = await retryFailedMail();
  await writeAudit(audit({ action: "email.retry", entity: "email_outbox", summary: `Gửi lại thư lỗi: ${sent} thành công, ${failed} lỗi` }));
  revalidatePath("/admin/hop-thu");
  return { ok: true, message: `Đã gửi lại: ${sent} thư thành công, ${failed} thư vẫn lỗi.` };
}

// Gửi một thư thử tới chính email của nhân viên đang đăng nhập, để kiểm tra cấu hình SMTP.
export async function sendTestMailAction(): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  const mail = layout({
    title: "Thư thử",
    paragraphs: [`Chào ${audit.user.name},`, "Nếu bạn đọc được thư này, cấu hình gửi email của cửa hàng đã hoạt động."],
  });
  const status = await sendMail({ to: audit.user.email, subject: "Thư thử từ cửa hàng", kind: "test", ref: audit.user.id, ...mail });
  revalidatePath("/admin/hop-thu");
  const messages = {
    sent: `Đã gửi thư thử tới ${audit.user.email}.`,
    logged: "Chưa cấu hình SMTP: thư thử chỉ được ghi vào hộp thư bên dưới, chưa gửi đi.",
    failed: "Gửi thư thử thất bại; xem lỗi ở dòng đầu bảng.",
    queued: "Thư đang chờ gửi.",
  } as const;
  return { ok: status !== "failed", message: messages[status] };
}
