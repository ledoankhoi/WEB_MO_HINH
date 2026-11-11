import { getFlashSales } from "@/server/catalog";
import { FlashSaleBlock } from "./FlashSaleBlock";

// Phần máy chủ của khối flash sale ở trang chủ: đọc chương trình (có cache) rồi để trình duyệt chọn theo giờ.
export async function FlashSaleSection() {
  const sales = await getFlashSales();
  return sales.length > 0 ? <FlashSaleBlock sales={sales} /> : null;
}
