"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Zap } from "lucide-react";
import { flashState, formatCountdown, type FlashOffer } from "@/lib/flash-sale";
import { formatVnd } from "@/lib/format";

// Đồng hồ của trình duyệt, nhảy mỗi giây. Lúc dựng HTML ở máy chủ và lúc hydrate là null (trang được cache chung, không
// biết giờ xem), nên phần phụ thuộc giờ chỉ hiện sau khi trang đã chạy ở trình duyệt.
const subscribe = (notify: () => void) => {
  const id = window.setInterval(notify, 1000);
  return () => window.clearInterval(id);
};
const getSnapshot = () => Math.floor(Date.now() / 1000) * 1000;
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Hiện cùng giá sắp chạy flash sale trong khoảng này.
const UPCOMING_WINDOW = 3 * 24 * 3600 * 1000;

// Giá của thẻ hoặc trang sản phẩm khi có flash sale. Chưa chạy hoặc đã hết: hiện `children` (giá thường), sắp chạy thì kèm
// dòng báo giờ bắt đầu. Đang chạy: giá sale, giá thường gạch ngang, đếm ngược và số suất còn lại.
export function FlashPrice({ flash, basePrice, size = "card", children }: { flash: FlashOffer | null; basePrice: number; size?: "card" | "detail"; children: ReactNode }) {
  const now = useNow();
  const state = now === null ? null : flashState(flash, now);
  if (!flash || now === null || state === null || state === "ended") return <>{children}</>;

  if (state === "upcoming") {
    if (flash.startsAt - now > UPCOMING_WINDOW) return <>{children}</>;
    return (
      <>
        {children}
        <p className="flex items-center gap-1 text-sm font-semibold text-cobalt">
          <Zap className="size-4" aria-hidden />
          Flash sale {formatVnd(flash.price)} sau {formatCountdown(flash.startsAt - now)}
        </p>
      </>
    );
  }

  if (state === "sold_out") {
    return (
      <>
        {children}
        <p className="text-sm font-semibold text-muted">Đã hết suất flash sale</p>
      </>
    );
  }

  const percent = Math.round(((basePrice - flash.price) / basePrice) * 100);
  return (
    <div className="space-y-1.5">
      <p className="inline-flex items-center gap-1.5 bg-brand px-2 py-0.5 font-condensed text-base font-extrabold text-white uppercase">
        <Zap className="size-4" aria-hidden />
        {flash.title} · −{percent}%
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <p className={`font-black text-brand tabular-nums ${size === "detail" ? "text-3xl" : "font-condensed text-[30px] leading-tight italic"}`}>{formatVnd(flash.price)}</p>
        <p className="text-sm text-muted line-through tabular-nums">{formatVnd(basePrice)}</p>
      </div>
      <p className="text-sm font-semibold tabular-nums" role="timer" aria-live="off">
        Kết thúc sau {formatCountdown(flash.endsAt - now)} · còn {flash.left} suất
      </p>
    </div>
  );
}
