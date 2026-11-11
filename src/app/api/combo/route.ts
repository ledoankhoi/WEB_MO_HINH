import { listDealsForProducts } from "@/server/repo/bundles";

// Combo đang bật có chứa các sản phẩm trong giỏ (nghiep-vu-ban-hang mục 12), kèm thẻ của mọi thành viên để giỏ gợi ý món còn
// thiếu. Giỏ tính trước số giảm bằng src/lib/bundles.ts; máy chủ tính lại khi đặt hàng.
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("products") ?? "")
    .split(",")
    .filter((id) => /^[a-z0-9]{1,40}$/i.test(id))
    .slice(0, 50);
  const deals = await listDealsForProducts(ids);
  return Response.json({ deals }, { headers: { "Cache-Control": "no-store" } });
}
