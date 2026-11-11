"use client";

import { useEffect, useState } from "react";
import { clearViewed, pushViewed, readViewed } from "@/lib/recently-viewed";
import type { ProductSummary } from "@/lib/types";
import { ProductGrid } from "./ProductCard";

// Khối "Đã xem gần đây" (nghiep-vu-ban-hang mục 8). Ở trang sản phẩm, `current` là sản phẩm đang xem: được ghi vào lịch sử
// và không hiện lại trong khối. Danh sách đọc sau khi trang đã hiện (trang được cache chung cho mọi khách).
export function RecentlyViewed({ current, title = "Đã xem gần đây" }: { current?: string; title?: string }) {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const slugs = current ? pushViewed(current) : readViewed();
    const controller = new AbortController();
    fetch("/api/da-xem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slugs, exclude: current ?? "" }),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { products: ProductSummary[]; signedIn: boolean } | null) => {
        if (!data) return;
        setProducts(data.products);
        setSignedIn(data.signedIn);
      })
      .catch(() => {
        // Lỗi mạng: không hiện khối, không ảnh hưởng trang.
      });
    return () => controller.abort();
  }, [current]);

  if (products.length === 0) return null;
  return (
    <section aria-labelledby="da-xem-gan-day" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="da-xem-gan-day" className="text-2xl font-bold tracking-tight">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => {
            clearViewed();
            setProducts([]);
            if (signedIn) void fetch("/api/da-xem", { method: "DELETE" });
          }}
          className="text-sm text-muted underline hover:text-fg"
        >
          Xoá lịch sử xem
        </button>
      </div>
      <ProductGrid products={products.slice(0, 4)} />
    </section>
  );
}
