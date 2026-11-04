"use client";

import { useState } from "react";
import Link from "next/link";
import { Highlight } from "@animate-ui/react/primitives/effects/highlight";

export type FilterLink = { value: string; href: string; label: string };

// Hàng nút lọc của trang cửa hàng. Nền đậm của mục đang chọn trượt sang mục mới (Animate UI Highlight)
// ngay khi bấm, không đợi trang tải xong kết quả. Mỗi mục vẫn là liên kết thường.
export function FilterNav({ items, active, label }: { items: FilterLink[]; active: string; label: string }) {
  // Mục vừa bấm chỉ có hiệu lực khi URL chưa đổi; trang mới về (hoặc bấm quay lại, "Xoá bộ lọc")
  // thì theo giá trị từ máy chủ.
  const [clicked, setClicked] = useState<{ from: string; to: string } | null>(null);
  const current = clicked?.from === active ? clicked.to : active;

  return (
    <nav aria-label={label} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Highlight value={current} hover={false} click={false} className="inset-0 rounded-full bg-fg">
        {items.map((item) => (
          <Link
            key={item.value}
            href={item.href}
            data-value={item.value}
            aria-current={item.value === active ? "true" : undefined}
            onClick={() => setClicked({ from: active, to: item.value })}
            className={
              "block rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted " +
              "transition-colors duration-300 hover:border-fg/30 hover:text-fg " +
              "data-[active=true]:border-fg data-[active=true]:bg-transparent data-[active=true]:text-bg"
            }
          >
            {item.label}
          </Link>
        ))}
      </Highlight>
    </nav>
  );
}
