import "server-only";
import { getDb } from "../db";
import { newId } from "../ids";

// Gửi email (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 1). Mọi thư đều ghi vào bảng email_outbox trước khi gửi:
// - Có cấu hình SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM): gửi qua nodemailer, trạng thái 'sent' hoặc
//   'failed' (thử lại được ở /admin/hop-thu, tối đa MAX_ATTEMPTS lần).
// - Chưa cấu hình: trạng thái 'logged', thư chỉ nằm trong hộp thư thử ở /admin/hop-thu (để phát triển và kiểm thử).
// Lỗi gửi không bao giờ làm hỏng thao tác chính (đặt hàng, đặt lại mật khẩu...): chỉ ghi lại lỗi.

export type MailKind = "password_reset" | "password_changed" | "order" | "return" | "qa" | "otp" | "test";
export type Mail = { to: string; subject: string; html: string; text: string; kind: MailKind; ref?: string };
export type OutboxStatus = "queued" | "sent" | "failed" | "logged";

export const MAX_ATTEMPTS = 5;

type SmtpConfig = { host: string; port: number; user: string; pass: string; from: string };

export function smtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const from = env.MAIL_FROM?.trim() || user;
  return { host, port, user, pass, from };
}

let transporter: Promise<import("nodemailer").Transporter> | null = null;

async function transport(config: SmtpConfig) {
  transporter ??= import("nodemailer").then((nodemailer) =>
    nodemailer.createTransport({ host: config.host, port: config.port, secure: config.port === 465, auth: { user: config.user, pass: config.pass } }),
  );
  return transporter;
}

async function deliver(id: string, mail: Pick<Mail, "to" | "subject" | "html" | "text">): Promise<OutboxStatus> {
  const db = await getDb();
  const config = smtpConfig();
  if (!config) {
    await db.execute({ sql: "UPDATE email_outbox SET status = 'logged' WHERE id = ?", args: [id] });
    return "logged";
  }
  try {
    await (await transport(config)).sendMail({ from: config.from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    await db.execute({
      sql: "UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = '' WHERE id = ?",
      args: [Date.now(), id],
    });
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Lỗi không rõ";
    await db.execute({ sql: "UPDATE email_outbox SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?", args: [message, id] });
    return "failed";
  }
}

// Ghi thư vào hộp thư đi rồi gửi ngay. Trả về trạng thái sau lần gửi đầu.
export async function sendMail(mail: Mail): Promise<OutboxStatus> {
  const db = await getDb();
  const id = newId();
  await db.execute({
    sql: `INSERT INTO email_outbox (id, to_email, subject, html, text_body, kind, ref, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
    args: [id, mail.to, mail.subject, mail.html, mail.text, mail.kind, mail.ref ?? "", Date.now()],
  });
  try {
    return await deliver(id, mail);
  } catch {
    return "failed";
  }
}

// Gửi lại các thư lỗi chưa quá số lần thử. Trả về số thư gửi được.
export async function retryFailedMail(limit = 50): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, to_email, subject, html, text_body FROM email_outbox WHERE status = 'failed' AND attempts < ? ORDER BY created_at LIMIT ?",
    args: [MAX_ATTEMPTS, limit],
  });
  let sent = 0;
  let failed = 0;
  for (const row of result.rows) {
    const status = await deliver(String(row.id), { to: String(row.to_email), subject: String(row.subject), html: String(row.html), text: String(row.text_body) });
    if (status === "sent") sent++;
    else failed++;
  }
  return { sent, failed };
}

export type OutboxRow = { id: string; to: string; subject: string; kind: string; status: OutboxStatus; attempts: number; error: string; createdAt: number; sentAt: number | null };

export async function listOutbox(limit = 100): Promise<OutboxRow[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, to_email, subject, kind, status, attempts, last_error, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT ?",
    args: [limit],
  });
  return result.rows.map((row) => ({
    id: String(row.id),
    to: String(row.to_email),
    subject: String(row.subject),
    kind: String(row.kind),
    status: String(row.status) as OutboxStatus,
    attempts: Number(row.attempts),
    error: String(row.last_error),
    createdAt: Number(row.created_at),
    sentAt: row.sent_at === null ? null : Number(row.sent_at),
  }));
}

export async function getOutboxHtml(id: string): Promise<{ subject: string; html: string } | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT subject, html FROM email_outbox WHERE id = ?", args: [id] })).rows[0];
  return row ? { subject: String(row.subject), html: String(row.html) } : null;
}
