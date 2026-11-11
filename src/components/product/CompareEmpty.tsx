"use client";

import Link from "next/link";
import { useCompareList } from "@/lib/compare";
import { CompareFromStorage } from "./CompareRemove";

// Trang so sánh chưa có sản phẩm trên URL: mở danh sách đã chọn ở trình duyệt (nếu có) hoặc hướng dẫn cách chọn.
export function CompareEmpty() {
  const saved = useCompareList();
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center text-sm">
      <p className="font-semibold">Chưa có sản phẩm nào để so sánh</p>
      <p className="text-muted">Bấm “So sánh” ở thẻ hoặc trang sản phẩm để chọn tối đa 4 sản phẩm.</p>
      <p className="flex flex-wrap justify-center gap-4">
        <CompareFromStorage slugs={saved} />
        <Link href="/san-pham" className="font-semibold underline">
          Xem sản phẩm
        </Link>
      </p>
    </div>
  );
}
