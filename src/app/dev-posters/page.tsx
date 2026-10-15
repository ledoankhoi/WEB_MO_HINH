"use client";
// TẠM: trang chụp ảnh đại diện sản phẩm từ mô hình 3D. Xoá sau khi chụp xong.
import { Suspense, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { RootState } from "@react-three/fiber";
import { capturePoster } from "@/components/three/PosterCanvas";
import { getModelFeatures } from "@/lib/model-features";

const PosterCanvas = dynamic(() => import("@/components/three/PosterCanvas"), { ssr: false });

function Poster() {
  const url = useSearchParams().get("url");
  const stateRef = useRef<RootState | null>(null);
  useEffect(() => {
    (window as unknown as { __capture: () => Promise<string | null> }).__capture = async () => {
      const blob = await capturePoster(stateRef.current);
      if (!blob) return null;
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    };
  }, []);
  if (!url) return null;
  return (
    <PosterCanvas
      source={{
        model: "humanoid",
        colors: { primary: "#fff", secondary: "#000", accent: "#0af" },
        modelUrl: url,
        features: getModelFeatures(url),
      }}
      stateRef={stateRef}
      displaySize={640}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <Poster />
    </Suspense>
  );
}
