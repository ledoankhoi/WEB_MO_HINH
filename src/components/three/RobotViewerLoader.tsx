"use client";

import dynamic from "next/dynamic";
import type { RobotViewerProps } from "./RobotViewer";

// Three.js chỉ được tải khi trang thật sự hiển thị khung xem 3D, và không chạy ở máy chủ.
const RobotViewer = dynamic(() => import("./RobotViewer"), {
  ssr: false,
  loading: () => <p className="grid size-full place-items-center text-sm text-muted">Đang tải mô hình 3D...</p>,
});

export default function RobotViewerLoader(props: RobotViewerProps) {
  return <RobotViewer {...props} />;
}
