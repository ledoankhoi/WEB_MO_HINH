import "server-only";

// Supabase Storage, bucket công khai `media` (cùng chỗ với `npm run media`). Tách riêng để test thay bằng bản giả.
const BUCKET = "media";

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY: chưa tải file lên được.");
  // Khoá dạng mới (sb_secret_...) chỉ gửi qua apikey; khoá JWT cũ gửi cả Authorization.
  const auth: Record<string, string> = key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  return { url, auth };
}

// Đường dẫn công khai theo MEDIA_BASE_URL (nếu có) để khớp với dữ liệu mẫu.
export function publicUrl(path: string): string {
  const base = process.env.MEDIA_BASE_URL?.trim().replace(/\/$/, "") || `${config().url}/storage/v1/object/public/${BUCKET}`;
  return `${base}/${path}`;
}

export async function uploadObject(path: string, data: Uint8Array<ArrayBuffer>, contentType: string): Promise<string> {
  const { url, auth } = config();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": contentType, "Cache-Control": "max-age=31536000" },
    body: data,
  });
  if (!response.ok) throw new Error(`Tải lên Storage thất bại: HTTP ${response.status}`);
  return publicUrl(path);
}

// Q18: URL tải lên có chữ ký, trình duyệt gửi thẳng file (PUT) tới Storage mà không đi qua máy chủ này.
export async function createSignedUploadUrl(path: string): Promise<string> {
  const { url, auth } = config();
  const response = await fetch(`${url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: auth });
  if (!response.ok) throw new Error(`Không tạo được URL tải lên: HTTP ${response.status}`);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Storage không trả về URL tải lên");
  return `${url}/storage/v1${body.url}`;
}

// Đọc vài byte đầu của file đã tải lên và tổng kích thước (từ Content-Range). null nếu chưa có file.
export async function readObjectHead(path: string, length: number): Promise<{ bytes: Uint8Array; size: number } | null> {
  const { url, auth } = config();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { headers: { ...auth, Range: `bytes=0-${length - 1}` } });
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer()).subarray(0, length);
  const total = Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1] ?? bytes.length);
  return { bytes, size: total };
}

// Xoá file đã tải lên; lỗi xoá không làm hỏng thao tác chính (file mồ côi vô hại).
export async function deleteObject(path: string): Promise<void> {
  const { url, auth } = config();
  await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: auth }).catch(() => {});
}

// Nhận diện ảnh theo chữ ký file thật (QT-22), không tin phần mở rộng hay kiểu MIME do trình duyệt gửi.
export function detectImageType(bytes: Uint8Array): { contentType: string; ext: string } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp" };
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return { contentType: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  return null;
}
