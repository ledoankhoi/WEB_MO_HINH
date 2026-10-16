import "server-only";
import { writeAudit, type AuditEntry } from "./repo/audit";
import { addMedia, findProductById, setProductModel } from "./repo/products";
import { createSignedUploadUrl, deleteObject, detectImageType, publicUrl, readObjectHead, uploadObject } from "./storage";

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

export const MAX_MODEL_BYTES = 25 * 1024 * 1024;

// YC-SP-10, Q18 bước 1: cấp URL tải lên có chữ ký cho một file .glb mới; tên file do máy chủ đặt.
export async function startModelUpload(productId: string): Promise<{ ok: true; path: string; uploadUrl: string } | { ok: false; message: string }> {
  if (!(await findProductById(productId))) return { ok: false, message: "Sản phẩm không còn tồn tại." };
  const path = `models/${productId}-${randomName()}.glb`;
  return { ok: true, path, uploadUrl: await createSignedUploadUrl(path) };
}

// Bước 2, sau khi trình duyệt tải xong: kiểm tra phần đầu glTF nhị phân (12 byte: "glTF", phiên bản 2, độ dài
// khớp kích thước file) và giới hạn 25 MB. Sai thì xoá file; đúng thì gắn vào sản phẩm.
export async function finishModelUpload(productId: string, path: string, audit: AuditEntry): Promise<UploadResult> {
  if (!/^[a-f0-9]{20}$/.test(productId) || !new RegExp(`^models/${productId}-[a-f0-9]{12}\\.glb$`).test(path)) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  const head = await readObjectHead(path, 12);
  if (!head) return { ok: false, message: "Chưa thấy file trên kho media. Vui lòng tải lại." };
  const view = new DataView(head.bytes.buffer, head.bytes.byteOffset, head.bytes.byteLength);
  const valid =
    head.bytes.length === 12 &&
    String.fromCharCode(...head.bytes.subarray(0, 4)) === "glTF" &&
    view.getUint32(4, true) === 2 &&
    view.getUint32(8, true) === head.size;
  const problem =
    head.size > MAX_MODEL_BYTES
      ? "File lớn hơn 25 MB. Hãy nén mô hình (meshopt, texture WebP) trước khi tải."
      : !valid
        ? "File không phải mô hình glTF 2.0 nhị phân (.glb) hợp lệ."
        : null;
  if (problem) {
    await deleteObject(path);
    return { ok: false, message: problem };
  }
  const url = publicUrl(path);
  const id = await setProductModel(productId, url, { ...audit, summary: `${audit.summary} (${Math.ceil(head.size / 1024)} KB)` });
  if (!id) {
    await deleteObject(path);
    return { ok: false, message: "Sản phẩm không còn tồn tại." };
  }
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
