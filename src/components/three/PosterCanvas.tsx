"use client";

import type { RefObject } from "react";
import { Canvas, type RootState } from "@react-three/fiber";
import { RobotSubject, StudioLights, type ModelSource } from "./Stage";

export const POSTER_SIZE = 640;

// Góc nhìn 3/4 cố định để mọi ảnh đại diện đồng bộ với nhau.
const POSTER_CAMERA: [number, number, number] = [2.9, 1.3, 5.4];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Chụp khung hình hiện tại của PosterCanvas thành ảnh WebP nền trong suốt.
export async function capturePoster(state: RootState | null): Promise<Blob | null> {
  if (!state) return null;
  // Canvas chỉ vẽ khi có thay đổi (frameloop="demand"), nên yêu cầu vẽ lại rồi chờ vài khung hình.
  state.invalidate();
  await nextFrame();
  await nextFrame();
  return new Promise((resolve) => state.gl.domElement.toBlob(resolve, "image/webp", 0.92));
}

// Khung vẽ vuông, mô hình đứng yên. Dùng để xem trước và chụp ảnh đại diện sản phẩm.
// Ảnh chụp luôn có cạnh POSTER_SIZE điểm ảnh dù khung hiển thị trên trang nhỏ hơn.
export default function PosterCanvas({
  source,
  stateRef,
  displaySize = 320,
}: {
  source: ModelSource;
  stateRef: RefObject<RootState | null>;
  displaySize?: number;
}) {
  return (
    <Canvas
      style={{ width: displaySize, height: displaySize }}
      dpr={POSTER_SIZE / displaySize}
      frameloop="demand"
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      camera={{ position: POSTER_CAMERA, fov: 26 }}
      onCreated={(state) => {
        stateRef.current = state;
      }}
    >
      <StudioLights />
      <RobotSubject {...source} animate={false} />
    </Canvas>
  );
}
