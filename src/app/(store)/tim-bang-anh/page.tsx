import type { Metadata } from "next";
import { ImageSearch } from "@/components/image-search/ImageSearch";
import { RobotRecognition } from "@/components/recognition/RobotRecognition";
import { IMAGE_SEARCH_MODEL } from "@/lib/image-search";
import { getImageSearchStatus } from "@/server/image-search";
import { getActiveRecognitionModel } from "@/server/recognition";

export const metadata: Metadata = {
  title: "Tìm bằng ảnh",
  description: "Gửi ảnh một con robot, AI cho biết đó là robot nào, thuộc dòng nào và cửa hàng có bán mô hình của nó không.",
};

// Trang tìm bằng ảnh của khách. Có mô hình nhận dạng robot đang bật (B11, docs/nhan-dang-robot/) thì dùng nhận dạng;
// chưa bật thì giữ cách cũ: so ảnh với hình dựng từ mô hình 3D của sản phẩm (docs/chuan/08-tich-hop-ai.md).
export default async function ImageSearchPage() {
  const model = await getActiveRecognitionModel();
  if (model) {
    const { id, label, files, mb, input, temperature, thresholds, labels } = model;
    return (
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
        <div className="max-w-2xl space-y-2">
          <p className="text-xs font-bold tracking-wider text-brand-strong uppercase">Nhận dạng bằng AI</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Đây là robot nào?</h1>
          <p className="text-muted">
            Có ảnh một con robot nhưng không biết tên? Gửi ảnh, AI xếp hạng những robot giống nhất kèm % cho từng robot, và gợi ý mô hình cửa hàng đang
            bán.
          </p>
        </div>
        <RobotRecognition model={{ id, label, files, mb, input, temperature, thresholds, labels }} />
      </div>
    );
  }
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
