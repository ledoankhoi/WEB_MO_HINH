import "server-only";
import { headers } from "next/headers";

// Địa chỉ IP của khách, dùng làm khoá giới hạn tần suất. Giá trị này lấy từ X-Forwarded-For nên chỉ
// đáng tin khi ứng dụng đứng sau reverse proxy ghi đè header đó.
export async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0].trim().slice(0, 64) || "unknown";
}

// Địa chỉ gốc để tạo liên kết tuyệt đối trong email. KHÔNG tin header Host của yêu cầu: kẻ xấu đặt Host giả thì liên
// kết đặt lại mật khẩu gửi cho nạn nhân sẽ trỏ về tên miền của kẻ xấu và lộ token (host header injection).
// - Có NEXT_PUBLIC_SITE_URL: luôn dùng giá trị đó.
// - Chưa đặt: chỉ nhận Host khi là localhost hoặc *.localhost (máy phát triển), còn lại dùng `fallback`.
export async function getBaseUrl(fallback: string): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  let host = "";
  try {
    host = (await headers()).get("host")?.trim().toLowerCase() ?? "";
  } catch {
    return fallback; // ngoài một yêu cầu web (script, test): không có header
  }
  if (/^(localhost|[a-z0-9-]+\.localhost)(:\d+)?$/.test(host)) return `http://${host}`;
  return fallback;
}
