import { revalidateTag } from "next/cache";
import { authorize } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { MAX_IMAGE_BYTES, uploadProductImage } from "@/server/media-upload";

// Tải ảnh sản phẩm (Q17). Route Handler thay vì Server Action vì ảnh vượt giới hạn 1 MB của Server Action.
// Nằm dưới /admin để trình duyệt gửi kèm cookie quản trị.
export async function POST(request: Request) {
  const user = await authorize("catalog.edit");
  if (!user) return Response.json({ ok: false, message: "Bạn không có quyền thực hiện thao tác này." }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) {
    return Response.json({ ok: false, message: "Ảnh lớn hơn 5 MB." }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const productId = form?.get("productId");
  const file = form?.get("file");
  if (typeof productId !== "string" || !/^[a-f0-9]{20}$/.test(productId) || !(file instanceof File)) {
    return Response.json({ ok: false, message: "Yêu cầu không hợp lệ." }, { status: 400 });
  }
  const result = await uploadProductImage(productId, file, String(form?.get("alt") ?? ""), {
    actor: { id: user.id, role: user.role },
    action: "product_media.upload",
    entity: "product_media",
    summary: "Tải ảnh sản phẩm",
  });
  // updateTag chỉ dùng được trong Server Action; Route Handler dùng revalidateTag.
  if (result.ok) revalidateTag(PRODUCTS_TAG, "max");
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
