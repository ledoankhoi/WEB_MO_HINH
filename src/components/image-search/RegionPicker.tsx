"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Rect } from "./pixels";

// Ảnh khách chọn, kèm khoanh vùng: kéo chuột hoặc ngón tay để chọn phần có robot (ảnh nhiều đồ vật, robot
// nhỏ trong khung). Vùng tính theo điểm ảnh của canvas nguồn; null là dùng cả ảnh.
export function RegionPicker({
  source,
  region,
  onChange,
  disabled = false,
}: {
  source: HTMLCanvasElement;
  region: Rect | null;
  onChange: (region: Rect | null) => void;
  disabled?: boolean;
}) {
  const display = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<Rect | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const { width, height } = source;
  // Vùng quá nhỏ (chạm nhầm) thì bỏ qua.
  const minSide = Math.max(16, Math.min(width, height) * 0.06);

  useEffect(() => {
    const context = display.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0);
  }, [source, width, height]);

  const point = (event: PointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) * width,
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) * height,
    };
  };

  const update = (next: Rect | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const shown = draft ?? region;
  const percent = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div
      ref={box}
      className={`relative mx-auto overflow-hidden rounded-xl bg-raised select-none ${disabled ? "" : "cursor-crosshair touch-none"}`}
      // Ảnh dọc rất cao thì giới hạn theo chiều cao màn hình, giữ đúng tỉ lệ.
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100%, calc(62vh * ${width / height}))` }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = point(event);
        update({ ...start.current, width: 0, height: 0 });
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const p = point(event);
        const s = start.current;
        update({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
      }}
      onPointerUp={() => {
        const next = draftRef.current;
        start.current = null;
        update(null);
        if (next && next.width >= minSide && next.height >= minSide) onChange(next);
      }}
      onPointerCancel={() => {
        start.current = null;
        update(null);
      }}
    >
      <canvas ref={display} width={width} height={height} className="block size-full" role="img" aria-label="Ảnh bạn chọn để tìm kiếm" />
      {shown && shown.width > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-md border-2 border-brand shadow-[0_0_0_9999px_rgba(15,17,20,0.5)]"
          style={{ left: percent(shown.x, width), top: percent(shown.y, height), width: percent(shown.width, width), height: percent(shown.height, height) }}
        />
      )}
    </div>
  );
}
