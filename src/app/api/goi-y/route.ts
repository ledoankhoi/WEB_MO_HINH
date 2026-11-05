import { getSearchSuggestions } from "@/server/catalog";

// Gợi ý cho ô tìm kiếm ở đầu trang khi khách đang gõ: GET /api/goi-y?q=optimus.
// Từ khoá dưới 2 ký tự thì trả rỗng, không truy vấn.
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const body = q.length < 2 ? { terms: [], products: [], total: 0 } : await getSearchSuggestions(q);
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=60" } });
}
