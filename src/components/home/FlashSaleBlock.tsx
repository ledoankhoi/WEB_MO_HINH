"use client";

import { Zap } from "lucide-react";
import { ProductGrid } from "@/components/product/ProductCard";
import { useNow } from "@/components/product/FlashPrice";
import { formatCountdown } from "@/lib/flash-sale";
import { formatDateTime } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";

type Sale = { id: string; title: string; startsAt: number; endsAt: number; products: ProductSummary[] };

// Khối flash sale ở trang chủ (nghiep-vu-ban-hang mục 9): chương trình đang chạy, không có thì chương trình sắp chạy gần
// nhất, kèm đếm ngược. Dữ liệu được cache nên trình duyệt tự chọn chương trình theo giờ; trước khi có đồng hồ thì chưa hiện.
export function FlashSaleBlock({ sales }: { sales: Sale[] }) {
  const now = useNow();
  if (now === null) return null;
  const open = sales.filter((sale) => sale.endsAt > now && sale.products.length > 0);
  const sale = open.find((item) => item.startsAt <= now) ?? open[0];
  if (!sale) return null;
  const live = sale.startsAt <= now;
  return (
    <section aria-labelledby="flash-sale" className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-3 border-ink bg-brand px-5 py-4 text-white shadow-[8px_8px_0_var(--color-ink)]">
        <h2 id="flash-sale" className="flex items-center gap-2 font-condensed text-[clamp(2rem,4vw,3rem)] leading-none font-black uppercase italic">
          <Zap className="size-9" strokeWidth={2.6} aria-hidden />
          {sale.title}
        </h2>
        <p className="font-condensed text-2xl font-extrabold uppercase tabular-nums" role="timer" aria-live="off">
          {live ? `Kết thúc sau ${formatCountdown(sale.endsAt - now)}` : `Bắt đầu ${formatDateTime(sale.startsAt)} · còn ${formatCountdown(sale.startsAt - now)}`}
        </p>
      </div>
      <ProductGrid products={sale.products.slice(0, 8)} />
    </section>
  );
}
