import type { ReactNode } from "react";
import { ProductImage } from "@/components/product/ProductCard";
import { RARITY_INFO, type Rarity } from "@/lib/gacha";

// Thẻ sưu tầm kiểu bài TCG của gacha: mặt trước (dải màu theo độ hiếm, số thứ tự, ảnh robot, tên, sao), mặt sau sọc
// coban có logo, ô "chưa có" trong bộ sưu tập. Thẻ lấp đầy khung cha; khung cha đặt chiều rộng và tỷ lệ 5:7.

// series: tên ngắn của series ("Series 2"); total: số thẻ của series (in "03/10").
export type CardView = { key: string; name: string; image: string | null; rarity: Rarity; number: number; series: string; total: number };

const HEAD: Record<Rarity, string> = {
  common: "bg-surface text-ink",
  rare: "bg-cobalt text-white",
  super: "bg-brand text-white",
  secret: "bg-ink text-[#ffd23f]",
};
const SIZE = {
  sm: { head: "text-[9px] px-1 py-px", name: "text-[11px]", foot: "text-[9px]" },
  md: { head: "text-[11px] px-1.5 py-0.5", name: "text-sm", foot: "text-[10px]" },
  lg: { head: "text-sm px-2 py-1", name: "text-xl", foot: "text-xs" },
} as const;
export type CardSize = keyof typeof SIZE;

export const cardNumber = (card: Pick<CardView, "number" | "total">) => `${String(card.number).padStart(2, "0")}/${card.total}`;

export function Stars({ rarity, className = "" }: { rarity: Rarity; className?: string }) {
  const count = RARITY_INFO[rarity].stars;
  return (
    <span className={`tracking-tight text-[#e0a800] ${className}`} aria-label={`${count} sao`}>
      {"★".repeat(count)}
    </span>
  );
}

export function CardFace({ card, size = "md", count = 0 }: { card: CardView; size?: CardSize; count?: number }) {
  const s = SIZE[size];
  const face = (
    <div
      className={`relative flex size-full flex-col overflow-hidden border-3 border-ink bg-surface text-ink ${card.rarity === "super" ? "gx-holo" : ""} ${card.rarity === "secret" ? "gx-holo gx-holo-strong" : ""}`}
    >
      <div className={`flex items-center justify-between border-b-3 border-ink font-condensed font-extrabold uppercase ${s.head} ${HEAD[card.rarity]}`}>
        <span className="truncate">{RARITY_INFO[card.rarity].label}</span>
        <span className="tabular-nums">{cardNumber(card)}</span>
      </div>
      <div className="halftone relative min-h-0 flex-1">
        <ProductImage src={card.image} alt="" className="absolute inset-0 size-full p-[6%]" />
        {count > 1 && (
          <span className="absolute top-1 right-1 border-2 border-ink bg-[#ffd23f] px-1 font-condensed text-xs font-black text-ink">×{count}</span>
        )}
      </div>
      <div className="border-t-3 border-ink px-1.5 py-1">
        <p className={`line-clamp-2 font-condensed leading-tight font-extrabold uppercase ${s.name}`}>{card.name}</p>
        <p className={`mt-0.5 flex items-center justify-between font-condensed font-bold uppercase ${s.foot}`}>
          <Stars rarity={card.rarity} />
          <span className="text-muted">{card.series}</span>
        </p>
      </div>
    </div>
  );
  // Thẻ Bí mật có viền cầu vồng chạy quanh.
  return card.rarity === "secret" ? <div className="gx-rainbow-frame size-full p-[3px]">{face}</div> : face;
}

// Mặt sau. `glow`: bên trong là thẻ Hiếm trở lên, viền lấp lánh vàng để khách hồi hộp trước khi lật.
export function CardBack({ glow = false, size = "md" }: { glow?: boolean; size?: CardSize }) {
  return (
    <div className={`stripes-cobalt relative grid size-full place-items-center border-3 border-ink ${glow ? "gx-back-glow" : ""}`}>
      <span aria-hidden className="absolute inset-[7%] border-2 border-white/50" />
      <span
        className={`-rotate-6 border-3 border-ink bg-surface px-2 py-1 font-condensed font-black text-ink uppercase italic shadow-[3px_3px_0_var(--color-ink)] ${size === "sm" ? "text-[10px]" : size === "lg" ? "text-xl" : "text-sm"}`}
      >
        ROBOTICA
      </span>
    </div>
  );
}

// Ô thẻ chưa có trong bộ sưu tập. `children`: nút ghép thẻ bằng mảnh (nếu ghép được).
export function MissingCard({ card, children }: { card: CardView; children?: ReactNode }) {
  const { rarity } = card;
  const secret = rarity === "secret";
  return (
    <div className={`flex size-full flex-col border-3 border-dashed border-ink/50 ${secret ? "bg-ink text-white" : "bg-raised"}`}>
      <div className="flex items-center justify-between px-1.5 py-0.5 font-condensed text-[10px] font-extrabold uppercase opacity-70">
        <span>Chưa có</span>
        <span className="tabular-nums">{cardNumber(card)}</span>
      </div>
      <div className="grid flex-1 place-items-center font-condensed text-6xl font-black opacity-30">?</div>
      <div className="px-1.5 pb-1.5">
        <p className="font-condensed text-xs font-extrabold uppercase opacity-60">???</p>
        <p className="flex items-center justify-between font-condensed text-[10px] font-bold uppercase">
          <Stars rarity={rarity} className="opacity-60" />
          <span className="opacity-60">{card.series}</span>
        </p>
        {children}
      </div>
    </div>
  );
}
