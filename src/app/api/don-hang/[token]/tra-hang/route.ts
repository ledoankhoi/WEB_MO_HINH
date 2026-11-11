import {
  MAX_RETURN_IMAGES,
  MAX_RETURN_IMAGE_BYTES,
  REFUND_ACCOUNT_MAX,
  REFUND_ACCOUNT_MIN,
  RETURN_NOTE_MAX,
  RETURN_REASONS,
  isReturnReason,
  suggestedRefund,
  validatePicks,
} from "@/lib/returns";
import { notifyReturnEvent } from "@/server/email/return-mails";
import { newId } from "@/server/ids";
import { findOrderByToken } from "@/server/repo/orders";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { createReturnRequest, returnEligibility } from "@/server/repo/returns";
import { getClientIp } from "@/server/request";
import { deleteObject, detectImageType, uploadObject } from "@/server/storage";

// Khách gửi yêu cầu trả hàng: POST /api/don-hang/[token]/tra-hang (multipart: reason, note, account, qty-<lineId>, images[]).
// Liên kết đơn (token bí mật) là bằng chứng chủ đơn, như nút huỷ đơn. Route Handler vì ảnh có thể vượt 1 MB của Server Action.
// Ảnh nằm ở Storage công khai dưới đường dẫn ngẫu nhiên returns/<id>-n.<đuôi>.

type Body = { ok: boolean; message: string; errors?: Record<string, string> };
const json = (status: number, body: Body) => Response.json(body, { status });
const MINUTE = 60 * 1000;

export async function POST(request: Request, ctx: RouteContext<"/api/don-hang/[token]/tra-hang">) {
  const { token } = await ctx.params;
  if (Number(request.headers.get("content-length") ?? 0) > MAX_RETURN_IMAGES * MAX_RETURN_IMAGE_BYTES + 256 * 1024) {
    return json(413, { ok: false, message: `Ảnh quá lớn (tối đa ${MAX_RETURN_IMAGES} ảnh, mỗi ảnh 3 MB).` });
  }
  const order = token.length >= 16 && token.length <= 128 ? await findOrderByToken(token) : null;
  if (!order) return json(404, { ok: false, message: "Không tìm thấy đơn hàng." });
  const limit = await consumeRateLimit(`return:${await getClientIp()}`, 10, 15 * MINUTE);
  if (!limit.allowed) return json(429, { ok: false, message: "Bạn gửi quá nhiều lần. Vui lòng thử lại sau ít phút." });

  const eligibility = await returnEligibility(order, Date.now());
  if (!eligibility.ok) return json(409, { ok: false, message: eligibility.message });

  const form = await request.formData().catch(() => null);
  if (!form) return json(400, { ok: false, message: "Yêu cầu không hợp lệ." });
  const reason = String(form.get("reason") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const account = String(form.get("account") ?? "").trim();
  const picks = new Map<number, number>();
  for (const item of order.items) {
    const raw = form.get(`qty-${item.lineId}`);
    const qty = raw === null || raw === "" ? 0 : Number(raw);
    if (qty !== 0) picks.set(item.lineId, qty);
  }
  const files = form.getAll("images").filter((value): value is File => value instanceof File && value.size > 0);

  const errors: Record<string, string> = {};
  const pickProblem = validatePicks(order.items, picks);
  if (pickProblem) errors.items = pickProblem;
  if (!isReturnReason(reason)) errors.reason = "Chọn lý do trả hàng.";
  if (note.length > RETURN_NOTE_MAX) errors.note = `Mô tả tối đa ${RETURN_NOTE_MAX} ký tự.`;
  if (isReturnReason(reason) && reason !== "changed_mind" && note.length < 10) errors.note = "Mô tả ngắn tình trạng hàng (ít nhất 10 ký tự).";
  if (account.length < REFUND_ACCOUNT_MIN || account.length > REFUND_ACCOUNT_MAX) {
    errors.account = "Nhập ngân hàng, số tài khoản và tên chủ tài khoản để nhận tiền hoàn.";
  }
  if (files.length > MAX_RETURN_IMAGES) errors.images = `Tối đa ${MAX_RETURN_IMAGES} ảnh.`;
  if (isReturnReason(reason) && RETURN_REASONS[reason].photo && files.length === 0) errors.images = "Lý do này cần ít nhất một ảnh chụp tình trạng hàng.";
  const images: { data: Uint8Array<ArrayBuffer>; contentType: string; ext: string }[] = [];
  for (const file of files.slice(0, MAX_RETURN_IMAGES)) {
    if (file.size > MAX_RETURN_IMAGE_BYTES) {
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
  if (Object.keys(errors).length > 0 || !isReturnReason(reason)) return json(400, { ok: false, message: "Vui lòng kiểm tra lại thông tin.", errors });

  const prefix = newId();
  const paths = images.map((image, index) => `returns/${prefix}-${index + 1}.${image.ext}`);
  const urls: string[] = [];
  try {
    for (const [index, image] of images.entries()) urls.push(await uploadObject(paths[index], image.data, image.contentType));
  } catch {
    await Promise.all(paths.slice(0, urls.length).map(deleteObject));
    return json(502, { ok: false, message: "Không tải được ảnh lên. Vui lòng thử lại." });
  }

  const created = await createReturnRequest({ order, reason, note, refundAccount: account, refundAmount: suggestedRefund(order, picks), picks, images: urls });
  if (!created) {
    await Promise.all(paths.map(deleteObject));
    return json(409, { ok: false, message: "Đơn này vừa có yêu cầu trả hàng khác." });
  }
  await notifyReturnEvent(created.id, "requested");
  return json(200, { ok: true, message: `Đã gửi yêu cầu ${created.code}. Cửa hàng sẽ trả lời qua email trong 1–2 ngày làm việc.` });
}
