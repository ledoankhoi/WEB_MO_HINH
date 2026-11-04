import type { Metadata } from "next";
import { ImageSearch } from "@/components/image-search/ImageSearch";
import { IMAGE_SEARCH_MODEL } from "@/lib/image-search";
import { getImageSearchStatus } from "@/server/image-search";

export const metadata: Metadata = {
  title: "Tìm bằng ảnh",
  description: "Chụp hoặc tải ảnh một robot, AI so với hình dựng từ mô hình 3D của từng sản phẩm để tìm đúng mẫu cửa hàng đang bán.",
};

// YC-AI-01: trang tìm kiếm bằng ảnh của khách (docs/chuan/08-tich-hop-ai.md).
export default async function ImageSearchPage() {
  const { products } = await getImageSearchStatus(IMAGE_SEARCH_MODEL.id);
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <p className="text-xs font-bold tracking-wider text-brand-strong uppercase">Tìm kiếm bằng AI</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Tìm mô hình bằng ảnh</h1>
        <p className="text-muted">
          Có ảnh một con robot nhưng không biết tên? Gửi ảnh, AI so với hình dựng từ mô hình 3D của từng sản phẩm và chỉ cho bạn đúng mẫu cửa hàng đang
          bán.
        </p>
      </div>
      <ImageSearch products={products} />
    </div>
  );
}
