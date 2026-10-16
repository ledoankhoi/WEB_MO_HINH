import { getCurrentUser } from "@/server/auth/session";
import { listWishlistIds } from "@/server/repo/wishlist";

// Mã sản phẩm khách đã yêu thích, để nút yêu thích trên trang (được cache chung) hiện đúng trạng thái.
// `ids: null` nghĩa là chưa đăng nhập.
export async function GET() {
  const user = await getCurrentUser();
  const ids = user ? await listWishlistIds(user.id) : null;
  return Response.json({ ids }, { headers: { "Cache-Control": "private, no-store" } });
}
