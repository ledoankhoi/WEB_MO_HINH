import "server-only";
import { writeAudit, type AuditEntry } from "./repo/audit";
import { addMedia, findProductById } from "./repo/products";
import { detectImageType, uploadObject } from "./storage";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type UploadResult = { ok: true; id: string; url: string } | { ok: false; message: string };

const randomName = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

// SEC-05, QT-22: ảnh WebP, PNG, JPEG tối đa 5 MB, kiểm tra chữ ký thật.
async function readImage(
  file: File,
): Promise<{ ok: false; message: string } | { ok: true; data: Uint8Array<ArrayBuffer>; type: { contentType: string; ext: string } }> {
  if (file.size === 0) return { ok: false, message: "Chưa chọn ảnh." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, message: "Ảnh lớn hơn 5 MB." };
  const data = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(data);
  return type ? { ok: true, data, type } : { ok: false, message: "File không phải ảnh WebP, PNG hoặc JPEG." };
}

// YC-SP-06: ảnh sản phẩm; tên file do máy chủ đặt.
export async function uploadProductImage(productId: string, file: File, alt: string, audit: AuditEntry): Promise<UploadResult> {
  const image = await readImage(file);
  if (!image.ok) return image;
  if (!(await findProductById(productId))) return { ok: false, message: "Sản phẩm không còn tồn tại." };
  const url = await uploadObject(`products/${productId}-${randomName()}.${image.type.ext}`, image.data, image.type.contentType);
  const id = await addMedia(productId, url, alt.trim().slice(0, 160), { ...audit, summary: `${audit.summary} (${image.type.ext}, ${Math.ceil(file.size / 1024)} KB)` });
  return { ok: true, id, url };
}

// YC-CMS-01: ảnh banner; trả về đường dẫn để điền vào form banner.
export async function uploadBannerImage(file: File, audit: AuditEntry): Promise<UploadResult> {
  const image = await readImage(file);
  if (!image.ok) return image;
  const id = randomName();
  const url = await uploadObject(`banners/${id}.${image.type.ext}`, image.data, image.type.contentType);
  await writeAudit({ ...audit, entityId: id, summary: `${audit.summary} (${image.type.ext})` });
  return { ok: true, id, url };
}
