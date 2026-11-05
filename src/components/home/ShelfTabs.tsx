"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type ShelfTab = { key: string; label: string; href: string; content: ReactNode };

// Khối "Mới về kệ" của trang chủ: tiêu đề và các nút lọc nhanh (Tất cả, Có biến hình 3D, Dưới 1 triệu, Còn hàng).
// Lưới sản phẩm của từng nút được dựng sẵn ở máy chủ; bấm nút chỉ đổi lưới đang hiện.
export function ShelfTabs({ heading, tabs }: { heading: ReactNode; tabs: ShelfTab[] }) {
  const [current, setCurrent] = useState(tabs[0]?.key ?? "");
  const tab = tabs.find((item) => item.key === current) ?? tabs[0];
  if (!tab) return null;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        {heading}
        <div role="group" aria-label="Lọc nhanh" className="flex flex-wrap gap-2.5">
          {tabs.map((item) => {
            const active = item.key === tab.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setCurrent(item.key)}
                className={`h-11 border-3 border-ink px-4 font-condensed text-lg font-extrabold uppercase transition ${active ? "bg-ink text-white" : "bg-surface hover:bg-raised"}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      {tab.content}
      <div className="mt-8 flex justify-center">
        <Link href={tab.href} className="btn btn-secondary btn-md inline-flex items-center gap-2 px-6">
          Xem tất cả
          <ArrowRight className="size-5" strokeWidth={2.6} aria-hidden />
        </Link>
      </div>
    </>
  );
}
