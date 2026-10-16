import "server-only";
import type { AuditEntry } from "./repo/audit";
import { addMedia, findProductById } from "./repo/products";
import { detectImageType, uploadObject } from "./storage";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadResult = { ok: true; id: string; url: string } | { ok: false; message: string };

// YC-SP-06, SEC-05, QT-22: ảnh WebP, PNG, JPEG tối đa 5 MB, kiểm tra chữ ký thật; tên file do máy chủ đặt.
export async function uploadProductImage(productId: string, file: File, alt: string, audit: AuditEntry): Promise<UploadResult> {
  if (file.size === 0) return { ok: false, message: "Chưa chọn ảnh." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "Ảnh lớn hơn 5 MB." };
  const data = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(data);
  if (!type) return { ok: false, message: "File không phải ảnh WebP, PNG hoặc JPEG." };
  if (!(await findProductById(productId))) return { ok: false, message: "Sản phẩm không còn tồn tại." };

  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  const url = await uploadObject(`products/${productId}-${random}.${type.ext}`, data, type.contentType);
  const id = await addMedia(productId, url, alt.trim().slice(0, 160), { ...audit, summary: `${audit.summary} (${type.ext}, ${Math.ceil(file.size / 1024)} KB)` });
  return { ok: true, id, url };
}
