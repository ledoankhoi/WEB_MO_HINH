import { after } from "next/server";
import { IMAGE_SEARCH_MODEL, parseVector } from "@/lib/image-search";
import { searchByEmbedding } from "@/server/image-search";
import { logImageSearch } from "@/server/repo/image-search";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

// YC-AI-03: tìm sản phẩm theo vector đặc trưng của ảnh. Ảnh của khách không rời trình duyệt: trình duyệt chạy
// mô hình (public/image-search/worker.js) và chỉ gửi lên vector 512 số. Xem docs/chuan/06-api.md.
const MAX_BODY_BYTES = 64 * 1024;
const LIMIT = 30;
const WINDOW_MS = 60 * 1000;

const error = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  Response.json({ error: code, message }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return error(413, "too-large", "Dữ liệu gửi lên quá lớn.");
  const limit = await consumeRateLimit(`image-search:${await getClientIp()}`, LIMIT, WINDOW_MS);
  if (!limit.allowed) {
    return error(429, "rate-limited", `Bạn tìm quá nhanh, thử lại sau ${limit.retryAfterSeconds} giây.`, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let body: { model?: unknown; embedding?: unknown; clientMs?: unknown };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return error(413, "too-large", "Dữ liệu gửi lên quá lớn.");
    body = JSON.parse(text);
  } catch {
    return error(400, "invalid", "Dữ liệu không hợp lệ.");
  }
  // Trình duyệt giữ bản cũ của trang (mô hình khác) thì vector không so được với chỉ mục.
  if (body?.model !== IMAGE_SEARCH_MODEL.id) return error(409, "model-mismatch", "Trang đã có phiên bản mới, tải lại trang rồi thử lại.");
  const query = parseVector(body.embedding, IMAGE_SEARCH_MODEL.dim);
  if (!query) return error(400, "invalid", "Vector đặc trưng không hợp lệ.");
  const clientMs = typeof body.clientMs === "number" && Number.isFinite(body.clientMs) ? Math.min(600_000, Math.max(0, Math.round(body.clientMs))) : null;

  const outcome = await searchByEmbedding(IMAGE_SEARCH_MODEL.id, query);
  if (outcome.candidates === 0) return error(409, "not-ready", "Cửa hàng chưa bật tìm kiếm bằng ảnh.");

  after(() =>
    logImageSearch({
      model: IMAGE_SEARCH_MODEL.id,
      topProductId: outcome.results[0]?.product.id ?? null,
      s1: outcome.s1,
      s2: outcome.s2,
      accepted: outcome.accepted,
      reason: outcome.reason,
      thresholds: { tau: outcome.tau, delta: outcome.delta },
      candidates: outcome.candidates,
      clientMs,
    }).catch((cause) => console.error("[robotica] Không ghi được nhật ký tìm bằng ảnh:", cause instanceof Error ? cause.message : cause)),
  );

  return Response.json(
    {
      accepted: outcome.accepted,
      reason: outcome.reason,
      s1: outcome.s1,
      s2: outcome.s2,
      tau: outcome.tau,
      delta: outcome.delta,
      candidates: outcome.candidates,
      results: outcome.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
