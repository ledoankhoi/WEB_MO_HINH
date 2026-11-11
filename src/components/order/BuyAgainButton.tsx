"use client";

import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";
import { cart } from "@/lib/cart";

// "Mua lại" (nghiep-vu-ban-hang mục 8): thêm lại mọi dòng của đơn cũ (cùng phiên bản, số lượng, tuỳ biến Xưởng) vào giỏ rồi
// mở giỏ. Giá và tồn kho mới nhất do giỏ hàng tải lại từ máy chủ; dòng không còn bán hoặc hết hàng hiện cảnh báo ở giỏ.
export function BuyAgainButton({ lines }: { lines: { variantId: string; quantity: number; cfg: string }[] }) {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      full
      onClick={() => {
        const added = lines.reduce((sum, line) => sum + cart.add(line.variantId, line.quantity, undefined, line.cfg), 0);
        showToast(added > 0 ? `Đã thêm ${added} sản phẩm của đơn này vào giỏ hàng.` : "Giỏ hàng đã có đủ các sản phẩm này.", { tone: added > 0 ? "success" : "info" });
        router.push("/gio-hang");
      }}
    >
      <RotateCcw className="size-4" aria-hidden />
      Mua lại
    </Button>
  );
}
