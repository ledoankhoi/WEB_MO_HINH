"use client";

import { useState } from "react";
import { Box } from "lucide-react";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import type { RobotViewerProps } from "@/components/three/RobotViewer";
import { ProductImage } from "./ProductCard";

// Khung trưng bày bên trái trang sản phẩm: mô hình 3D là mục đầu, sau đó ảnh đại diện và ảnh phụ.
// Dải ảnh nhỏ đứng dọc bên trái trên màn hình rộng, nằm ngang dưới khung trên điện thoại.
export function ProductGallery({
  viewer,
  images,
  name,
}: {
  viewer: RobotViewerProps;
  images: { url: string; alt: string }[];
  name: string;
}) {
  // -1: mô hình 3D, còn lại là vị trí ảnh.
  const [selected, setSelected] = useState(-1);
  const thumb = (active: boolean) =>
    `grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 bg-surface text-xs font-bold transition sm:size-[4.5rem] ${
      active ? "border-brand" : "border-line hover:border-fg/30"
    }`;

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {images.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" role="group" aria-label="Chọn ảnh xem">
          <button type="button" onClick={() => setSelected(-1)} aria-pressed={selected === -1} aria-label="Xem mô hình 3D" className={thumb(selected === -1)}>
            <span className="flex flex-col items-center gap-0.5">
              <Box className="size-5" aria-hidden />
              3D
            </span>
          </button>
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelected(index)}
              aria-pressed={selected === index}
              aria-label={`Xem ảnh ${index + 1}`}
              className={`${thumb(selected === index)} product-stage`}
            >
              <ProductImage src={image.url} alt="" className="size-full p-1.5" />
            </button>
          ))}
        </div>
      )}
      <div className="product-stage relative h-[380px] w-full min-w-0 overflow-hidden rounded-3xl border border-line sm:h-[560px] lg:w-auto lg:flex-1">
        {selected === -1 ? (
          <RobotViewerLoader {...viewer} />
        ) : (
          <ProductImage src={images[selected].url} alt={images[selected].alt || `${name}, ảnh ${selected + 1}`} className="size-full p-6" />
        )}
      </div>
    </div>
  );
}
