"use client";

import { useState } from "react";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import type { RobotViewerProps } from "@/components/three/RobotViewer";

type Photo = { url: string; alt: string };

// Khung ảnh của trang sản phẩm: ảnh thật của sản phẩm (ảnh hộp, ảnh mô hình hoàn thiện) là nội dung chính, mô hình
// 3D là tab phụ để xoay xem dáng. Ảnh ngoài hỏng (cửa hàng nguồn đổi đường dẫn) thì tự bỏ qua; hỏng hết thì mở tab 3D.
export function ProductGallery({
  name,
  photos,
  source,
  viewer,
  hint,
  credit,
}: {
  name: string;
  photos: Photo[];
  // Trang nguồn của ảnh thật (tên miền + đường dẫn), để ghi nguồn bên dưới.
  source: { host: string; url: string } | null;
  viewer: RobotViewerProps;
  hint: string;
  credit: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const visible = photos.filter((photo) => !failed.includes(photo.url));
  const [tab, setTab] = useState<"photos" | "3d">(photos.length > 0 ? "photos" : "3d");
  const [active, setActive] = useState(0);
  const current = visible[Math.min(active, visible.length - 1)];
  const showPhotos = tab === "photos" && visible.length > 0;

  const onError = (url: string) => {
    setFailed((list) => (list.includes(url) ? list : [...list, url]));
    setActive(0);
  };

  return (
    <div className="space-y-3">
      {photos.length > 0 && (
        <div role="tablist" aria-label="Cách xem sản phẩm" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm">
          <TabButton selected={showPhotos} disabled={visible.length === 0} onClick={() => setTab("photos")}>
            Ảnh thật ({visible.length})
          </TabButton>
          <TabButton selected={!showPhotos} onClick={() => setTab("3d")}>
            Xem 3D
          </TabButton>
        </div>
      )}

      {showPhotos && current ? (
        <>
          <div className="relative h-[380px] overflow-hidden rounded-2xl border border-line bg-white sm:h-[520px]">
            {/* Ảnh của cửa hàng nguồn, kích thước khác nhau nên không qua next/image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={current.url}
              src={current.url}
              alt={current.alt ? `${name}: ${current.alt}` : name}
              referrerPolicy="no-referrer"
              onError={() => onError(current.url)}
              className="size-full object-contain p-4"
            />
            {visible.length > 1 && (
              <>
                <NavButton side="left" label="Ảnh trước" onClick={() => setActive((i) => (i - 1 + visible.length) % visible.length)} />
                <NavButton side="right" label="Ảnh sau" onClick={() => setActive((i) => (i + 1) % visible.length)} />
              </>
            )}
          </div>
          {visible.length > 1 && (
            <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Ảnh nhỏ">
              {visible.map((photo, index) => (
                <li key={photo.url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-label={`Xem ảnh ${index + 1}`}
                    aria-current={photo.url === current.url}
                    className={`size-16 overflow-hidden rounded-lg border bg-white transition sm:size-20 ${
                      photo.url === current.url ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-fg/40"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => onError(photo.url)} className="size-full object-contain p-1" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {source && (
            <p className="text-xs text-muted">
              Ảnh sản phẩm thật, nguồn:{" "}
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {source.host}
              </a>
              .
            </p>
          )}
        </>
      ) : (
        <>
          <div className="product-stage h-[380px] overflow-hidden rounded-2xl border border-line sm:h-[520px]">
            <RobotViewerLoader {...viewer} />
          </div>
          <p className="text-xs text-muted">
            {photos.length > 0 && <strong className="font-medium text-fg">Mô hình 3D minh hoạ, có thể khác chi tiết so với sản phẩm thật. </strong>}
            {hint}
          </p>
          {credit}
        </>
      )}
    </div>
  );
}

function TabButton({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 font-medium transition disabled:opacity-40 ${selected ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
    >
      {children}
    </button>
  );
}

function NavButton({ side, label, onClick }: { side: "left" | "right"; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 ${side === "left" ? "left-3" : "right-3"} grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-lg shadow-sm transition hover:bg-surface`}
    >
      <span aria-hidden="true">{side === "left" ? "‹" : "›"}</span>
    </button>
  );
}
