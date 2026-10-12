import "server-only";
import { headers } from "next/headers";

// Địa chỉ IP của khách, dùng làm khoá giới hạn tần suất. Giá trị này lấy từ X-Forwarded-For nên chỉ
// đáng tin khi ứng dụng đứng sau reverse proxy ghi đè header đó.
export async function getClientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0].trim().slice(0, 64) || "unknown";
}
