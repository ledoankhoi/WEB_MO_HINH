"use server";

import { getCurrentUser } from "@/server/auth/session";
import { addToWishlist, removeFromWishlist } from "@/server/repo/wishlist";

// YC-DG-03: thêm hoặc bỏ yêu thích. Chưa đăng nhập thì trình duyệt chuyển tới trang đăng nhập.
export async function setWishlistAction(productId: string, on: boolean): Promise<{ ok: boolean; login?: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, login: true };
  if (typeof productId !== "string" || !/^[a-z0-9]{1,40}$/i.test(productId) || typeof on !== "boolean") return { ok: false };
  if (on) {
    await addToWishlist(user.id, productId);
  } else {
    await removeFromWishlist(user.id, productId);
  }
  return { ok: true };
}
