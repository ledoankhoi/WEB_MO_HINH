import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/server/auth/session";
import { newToken, sha256 } from "@/server/ids";
import { CHAT_MAX_LENGTH, countUnreadForCustomer, findThreadId, listMessages, postCustomerMessage, type ChatOwner } from "@/server/repo/chat";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

// Chat với cửa hàng (nghiep-vu-ban-hang mục 16). Khách đăng nhập: theo tài khoản. Khách vãng lai: token ngẫu nhiên trong
// cookie httpOnly `rs_chat` (chỉ gửi tới /api/chat), CSDL lưu SHA-256. GET ?after=<id>&open=1: tin mới (open=1 thì đánh dấu
// đã đọc) và số tin chưa đọc; POST { body }: gửi tin.

const COOKIE = "rs_chat";
const NO_STORE = { "Cache-Control": "private, no-store" };

async function owner(create: boolean): Promise<ChatOwner | null> {
  const user = await getCurrentUser();
  if (user) return { userId: user.id, name: user.name };
  const store = await cookies();
  let token = store.get(COOKIE)?.value ?? "";
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    if (!create) return null;
    token = newToken();
    const proto = (await headers()).get("x-forwarded-proto")?.split(",")[0].trim();
    store.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: proto === "https", path: "/api/chat", maxAge: 90 * 24 * 3600 });
  }
  return { visitorHash: sha256(token) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const who = await owner(false);
  const threadId = who ? await findThreadId(who) : null;
  if (!threadId) return Response.json({ messages: [], unread: 0 }, { headers: NO_STORE });
  const after = Math.max(0, Number(url.searchParams.get("after")) || 0);
  const open = url.searchParams.get("open") === "1";
  const messages = open ? await listMessages(threadId, after, "customer") : [];
  return Response.json({ messages, unread: open ? 0 : await countUnreadForCustomer(threadId) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const limit = await consumeRateLimit(`chat:${await getClientIp()}`, 30, 10 * 60 * 1000);
  if (!limit.allowed) return Response.json({ error: "Bạn gửi quá nhanh. Vui lòng đợi một chút." }, { status: 429, headers: NO_STORE });
  let body = "";
  try {
    const data = (await request.json()) as { body?: unknown };
    body = typeof data.body === "string" ? data.body.trim() : "";
  } catch {
    // Nội dung không hợp lệ: báo lỗi bên dưới.
  }
  if (!body || body.length > CHAT_MAX_LENGTH) return Response.json({ error: `Tin nhắn từ 1 đến ${CHAT_MAX_LENGTH} ký tự.` }, { status: 400, headers: NO_STORE });
  const who = (await owner(true))!;
  const threadId = await postCustomerMessage(who, body);
  return Response.json({ messages: await listMessages(threadId, 0, "customer") }, { headers: NO_STORE });
}
