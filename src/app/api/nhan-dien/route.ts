import { after } from "next/server";
import { buildHierarchy, type Hierarchy } from "@/lib/recognition";
import { buildRecognitionResponse, parseClientMs, parseProbabilities } from "@/lib/recognition-api";
import { getActiveRecognitionModel, getRecognitionCatalog } from "@/server/recognition";
import { logRecognition } from "@/server/repo/recognition";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

// B11: nhận dạng robot từ xác suất trình duyệt tính được (docs/nhan-dang-robot/00-ke-hoach.md). Ảnh không rời trình duyệt:
// worker ONNX chạy mô hình, trình duyệt gửi lên softmax(z / T) của mọi lớp. Máy chủ trả bảng xếp hạng 5 robot và sản phẩm đang bán
// của chúng; luật theo cấp (cùng hàm với trình duyệt) vẫn chạy để ghi nhật ký (không có ảnh), giao diện tạm thời không hiện.
const MAX_BODY_BYTES = 32 * 1024;
const LIMIT = 30;
const WINDOW_MS = 60 * 1000;

const error = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  Response.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store", ...headers } });

const hierarchies = new Map<string, Hierarchy>();

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error(413, "too-large", "Dữ liệu gửi lên quá lớn.");
  const limit = await consumeRateLimit(`recognition:${await getClientIp()}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    return error(429, "rate-limited", `Bạn gửi quá nhanh, thử lại sau ${limit.retryAfterSeconds} giây.`, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let body: { model?: unknown; probs?: unknown; clientMs?: unknown };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "too-large", "Dữ liệu gửi lên quá lớn.");
    body = JSON.parse(text);
  } catch {
    return error(400, "invalid", "Dữ liệu không hợp lệ.");
  }

  const model = await getActiveRecognitionModel();
  if (!model) return error(409, "not-ready", "Cửa hàng chưa bật nhận dạng robot.");
  // Trình duyệt còn giữ trang cũ (mô hình khác): xác suất không ứng với danh sách lớp hiện tại.
  if (body?.model !== model.id) return error(409, "model-mismatch", "Trang đã có phiên bản mới, tải lại trang rồi thử lại.");
  const probs = parseProbabilities(body.probs, model.labels.length);
  if (!probs) return error(400, "invalid", "Xác suất gửi lên không hợp lệ.");

  let hierarchy = hierarchies.get(model.id);
  if (!hierarchy) {
    hierarchy = buildHierarchy(model.labels);
    hierarchies.set(model.id, hierarchy);
  }
  const { response, result } = buildRecognitionResponse(model, hierarchy, probs, await getRecognitionCatalog());
  const top = model.labels[result.classIndex];

  const clientMs = parseClientMs(body.clientMs);
  after(() =>
    logRecognition({ model: model.id, topRobotSlug: top.slug, topProb: result.pClass, level: result.level, clientMs }).catch((cause) =>
      console.error("[robotica] Không ghi được nhật ký nhận dạng:", cause instanceof Error ? cause.message : cause),
    ),
  );
  return Response.json(response, { headers: { "Cache-Control": "no-store" } });
}
