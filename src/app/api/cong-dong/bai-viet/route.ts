import { MAX_POST_IMAGES, MAX_POST_IMAGE_BYTES, POST_MAX, POST_MIN, isCommunityTopic } from "@/lib/community";
import { getCurrentUser } from "@/server/auth/session";
import { newId } from "@/server/ids";
import { countRecentPosts, createPost } from "@/server/repo/community";
import { detectImageType, uploadObject } from "@/server/storage";

// Đăng bài Cộng đồng: POST /api/cong-dong/bai-viet (multipart: topic, body, product, images[]). Route Handler vì ảnh có
// thể vượt giới hạn 1 MB của Server Action. Bài vào hàng chờ duyệt (quyền community.moderate ở /admin/cong-dong).
export async function POST(request: Request) {
  const json = (status: number, body: { ok: boolean; message: string; id?: string; errors?: Record<string, string> }) => Response.json(body, { status });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_POST_IMAGES * MAX_POST_IMAGE_BYTES + 256 * 1024) {
    return json(413, { ok: false, message: `Tổng dung lượng ảnh quá lớn (tối đa ${MAX_POST_IMAGES} ảnh, mỗi ảnh 3 MB).` });
  }
  const user = await getCurrentUser();
  if (!user) return json(401, { ok: false, message: "Đăng nhập để đăng bài." });
  if ((await countRecentPosts(user.id, Date.now() - 60 * 60 * 1000)) >= 5) {
    return json(429, { ok: false, message: "Bạn đã đăng 5 bài trong một giờ. Hãy thử lại sau nhé." });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return json(400, { ok: false, message: "Yêu cầu không hợp lệ." });
  const topic = String(form.get("topic") ?? "");
  const body = String(form.get("body") ?? "").trim();
  const product = String(form.get("product") ?? "").trim();
  const files = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);

  const errors: Record<string, string> = {};
  if (!isCommunityTopic(topic)) errors.topic = "Chọn chủ đề cho bài viết.";
  if (body.length < POST_MIN || body.length > POST_MAX) errors.body = `Nội dung cần từ ${POST_MIN} đến ${POST_MAX} ký tự.`;
  if (product && !/^[a-z0-9-]{1,80}$/.test(product)) errors.product = "Sản phẩm không hợp lệ.";
  if (files.length > MAX_POST_IMAGES) errors.images = `Tối đa ${MAX_POST_IMAGES} ảnh.`;
  const images: { data: Uint8Array<ArrayBuffer>; contentType: string; ext: string }[] = [];
  for (const file of files.slice(0, MAX_POST_IMAGES)) {
    if (file.size > MAX_POST_IMAGE_BYTES) {
      errors.images = "Mỗi ảnh tối đa 3 MB.";
      break;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(data);
    if (!type) {
      errors.images = "Chỉ nhận ảnh WebP, PNG hoặc JPEG.";
      break;
    }
    images.push({ data, ...type });
  }
  if (Object.keys(errors).length > 0 || !isCommunityTopic(topic)) return json(400, { ok: false, message: "Vui lòng kiểm tra lại bài viết.", errors });

  const id = newId();
  const urls: string[] = [];
  for (const [index, image] of images.entries()) {
    urls.push(await uploadObject(`community/${id}-${index + 1}.${image.ext}`, image.data, image.contentType));
  }
  await createPost(user.id, { id, topic, body, productSlug: product || null }, urls);
  return json(200, { ok: true, id, message: "Đã gửi bài. Bài sẽ hiện sau khi được duyệt." });
}
