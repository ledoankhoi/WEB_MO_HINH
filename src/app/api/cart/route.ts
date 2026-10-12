import { findCartProducts } from "@/server/repo/products";

// Trả về giá và tồn kho hiện tại của các sản phẩm trong giỏ (giỏ hàng lưu ở trình duyệt).
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => /^[a-z0-9]{1,40}$/i.test(id))
    .slice(0, 50);

  const products = await findCartProducts(ids);
  return Response.json({ products }, { headers: { "Cache-Control": "no-store" } });
}
