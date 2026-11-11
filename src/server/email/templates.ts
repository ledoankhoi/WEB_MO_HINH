import "server-only";
import { site } from "@/config/site";

// Mẫu thư tiếng Việt theo giao diện cửa hàng (đỏ, đen, viền dày). Dùng bảng và style nội dòng vì nhiều ứng dụng thư
// bỏ qua <style>. Mỗi mẫu trả về cả HTML và bản chữ thường.

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// rows: bảng hai cột (ví dụ tên sản phẩm và thành tiền); dòng có `strong` in đậm (tổng cộng).
type Row = { label: string; value: string; strong?: boolean };
type Layout = { title: string; paragraphs: string[]; rows?: Row[]; action?: { label: string; url: string }; footnote?: string };

export function layout({ title, paragraphs, rows, action, footnote }: Layout): { html: string; text: string } {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0f172a">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#d62f1f;color:#ffffff;text-decoration:none;font-weight:800;text-transform:uppercase;padding:12px 22px;border:3px solid #111111">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#64748b">Nếu nút không bấm được, chép đường dẫn này vào trình duyệt:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  const table = rows?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 16px;border-top:2px solid #111111">${rows
        .map((row) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#0f172a;${row.strong ? "font-weight:800" : ""}">${escapeHtml(row.label)}</td><td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;white-space:nowrap;color:#0f172a;${row.strong ? "font-weight:800" : ""}">${escapeHtml(row.value)}</td></tr>`)
        .join("")}</table>`
    : "";
  const note = footnote ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b">${escapeHtml(footnote)}</p>` : "";
  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:3px solid #111111">
<tr><td style="background:#111111;padding:14px 22px;color:#ffffff;font-size:20px;font-weight:900;letter-spacing:1px">${escapeHtml(site.name)}</td></tr>
<tr><td style="padding:24px 22px">
<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${escapeHtml(title)}</h1>${body}${table}${button}${note}
</td></tr>
<tr><td style="border-top:3px solid #111111;padding:12px 22px;font-size:12px;color:#64748b">${escapeHtml(site.name)} · ${escapeHtml(site.slogan)} · ${escapeHtml(site.contact.email)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, "", ...paragraphs, ...(rows?.length ? ["", ...rows.map((row) => `${row.label}: ${row.value}`)] : []), ...(action ? ["", `${action.label}: ${action.url}`] : []), ...(footnote ? ["", footnote] : []), "", `${site.name} · ${site.contact.email}`].join("\n");
  return { html, text };
}

export function passwordResetMail(name: string, url: string, minutes: number) {
  return {
    subject: `Đặt lại mật khẩu ${site.name}`,
    ...layout({
      title: "Đặt lại mật khẩu",
      paragraphs: [
        `Chào ${name || "bạn"},`,
        `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${site.name} của bạn. Bấm nút dưới đây để đặt mật khẩu mới. Liên kết chỉ dùng được một lần và hết hạn sau ${minutes} phút.`,
      ],
      action: { label: "Đặt mật khẩu mới", url },
      footnote: "Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu của bạn không thay đổi.",
    }),
  };
}

export function passwordChangedMail(name: string, url: string) {
  return {
    subject: `Mật khẩu ${site.name} của bạn vừa được đổi`,
    ...layout({
      title: "Mật khẩu đã được đổi",
      paragraphs: [
        `Chào ${name || "bạn"},`,
        "Mật khẩu tài khoản của bạn vừa được đặt lại. Mọi thiết bị đang đăng nhập đã được đăng xuất.",
        `Nếu không phải bạn làm, hãy đặt lại mật khẩu ngay và liên hệ ${site.contact.email}.`,
      ],
      action: { label: "Đăng nhập", url },
    }),
  };
}
