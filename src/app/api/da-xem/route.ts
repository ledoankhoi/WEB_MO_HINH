import { MAX_VIEWED, SLUG_PATTERN } from "@/lib/recently-viewed";
import { getCurrentUser } from "@/server/auth/session";
import { listSummariesBySlugs } from "@/server/repo/products";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { clearRecentlyViewed, listRecentlyViewed, recordViews } from "@/server/repo/recently-viewed";
import { getClientIp } from "@/server/request";

// "Đã xem gần đây" (nghiep-vu-ban-hang mục 8). POST { slugs, exclude }: `slugs` là danh sách trong trình duyệt, mới nhất
// trước (sản phẩm đang xem đứng đầu). Đã đăng nhập: gộp vào tài khoản rồi trả danh sách của tài khoản; chưa: chỉ tra thông
// tin các slug đó. `exclude`: sản phẩm đang xem, không hiện lại trong khối. DELETE: xoá lịch sử xem của tài khoản.

const NO_STORE = { "Cache-Control": "private, no-store" };
const SHOWN = 8;

export async function POST(request: Request) {
  const limit = await consumeRateLimit(`viewed:${await getClientIp()}`, 240, 10 * 60 * 1000);
  if (!limit.allowed) return Response.json({ products: [] }, { status: 429, headers: NO_STORE });
  let body: { slugs?: unknown; exclude?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 400, headers: NO_STORE });
  }
  const slugs = Array.isArray(body.slugs) ? [...new Set(body.slugs.filter((slug): slug is string => typeof slug === "string" && SLUG_PATTERN.test(slug)))].slice(0, MAX_VIEWED) : [];
  const exclude = typeof body.exclude === "string" && SLUG_PATTERN.test(body.exclude) ? body.exclude : "";

  const user = await getCurrentUser();
  let products;
  if (user) {
    await recordViews(user.id, slugs, Date.now());
    products = await listRecentlyViewed(user.id, SHOWN + 1);
  } else {
    // Giữ thứ tự của trình duyệt (truy vấn trả theo thứ tự bất kỳ).
    const found = new Map((await listSummariesBySlugs(slugs)).map((product) => [product.slug, product]));
    products = slugs.flatMap((slug) => (found.has(slug) ? [found.get(slug)!] : []));
  }
  return Response.json(
    { products: products.filter((product) => product.slug !== exclude).slice(0, SHOWN), signedIn: !!user },
    { headers: NO_STORE },
  );
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (user) await clearRecentlyViewed(user.id);
  return Response.json({ ok: true }, { headers: NO_STORE });
}
