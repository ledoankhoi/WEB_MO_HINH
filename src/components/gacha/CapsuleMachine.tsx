"use client";

import type { CSSProperties } from "react";
import type { GachaSeries, Rarity } from "@/lib/gacha";

// Máy quay viên nang: vòm kính chứa viên nang (tung lên khi quay), thân máy đỏ có núm vặn (xoay khi quay) và cửa ra
// (viên nang vừa quay rơi xuống đây). Màu viên nang báo độ hiếm như các máy gacha thật.

const vars = (values: Record<string, string>) => values as CSSProperties;

export const CAPSULE_BG: Record<Rarity, string> = {
  common: "#ffd23f",
  rare: "#1f4fd8",
  super: "#d7261e",
  secret: "linear-gradient(135deg, #111 0 42%, #ffd23f 42% 52%, #111 52% 100%)",
};
export const AURA: Record<Rarity, string> = { common: "transparent", rare: "#4f7dff", super: "#ff4a3d", secret: "#ffd23f" };

export function Capsule({
  rarity,
  size,
  open = false,
  waiting = false,
  className = "",
}: {
  rarity: Rarity;
  size: number;
  open?: boolean;
  // Viên nang chờ khách chạm để mở: lắc nhẹ; Hiếm trở lên thì toả sáng.
  waiting?: boolean;
  className?: string;
}) {
  const special = rarity !== "common";
  return (
    <span
      className={`gx-capsule relative inline-block ${open ? "is-open" : ""} ${waiting ? "is-waiting" : ""} ${waiting && special ? "is-special" : ""} ${className}`}
      style={{ width: size, height: size, ...vars({ "--aura": AURA[rarity] }) }}
      aria-hidden
    >
      <span
        className="gx-capsule-half gx-capsule-top absolute inset-x-0 top-0 h-1/2 overflow-hidden rounded-t-full border-3 border-b-0 border-ink"
        style={{ background: CAPSULE_BG[rarity] }}
      >
        <span className="absolute top-[24%] left-[20%] h-[34%] w-[20%] -rotate-[30deg] rounded-full bg-white/60" />
      </span>
      <span className="gx-capsule-half gx-capsule-bottom absolute inset-x-0 bottom-0 h-1/2 rounded-b-full border-3 border-ink bg-white/90" />
    </span>
  );
}

// Vị trí viên nang trong vòm (phần trăm), màu, góc nghiêng và nhịp tung khi quay.
const PILE: { left: number; top: number; rarity: Rarity; rotate: number }[] = [
  { left: 10, top: 56, rarity: "common", rotate: 12 },
  { left: 26, top: 60, rarity: "rare", rotate: -20 },
  { left: 42, top: 58, rarity: "common", rotate: 35 },
  { left: 58, top: 61, rarity: "super", rotate: -8 },
  { left: 72, top: 55, rarity: "common", rotate: 22 },
  { left: 16, top: 72, rarity: "common", rotate: -30 },
  { left: 32, top: 75, rarity: "common", rotate: 18 },
  { left: 48, top: 74, rarity: "rare", rotate: -12 },
  { left: 64, top: 74, rarity: "common", rotate: 40 },
  { left: 20, top: 42, rarity: "common", rotate: 5 },
  { left: 36, top: 44, rarity: "secret", rotate: -25 },
  { left: 52, top: 43, rarity: "common", rotate: 30 },
  { left: 66, top: 41, rarity: "rare", rotate: -15 },
  { left: 44, top: 30, rarity: "common", rotate: 10 },
];

export function CapsuleMachine({
  series,
  spinning,
  outlet,
  coins,
}: {
  series: GachaSeries;
  spinning: boolean;
  // Viên nang vừa quay, nằm ở cửa ra.
  outlet: Rarity[];
  coins: number | null;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[23rem]">
      <div className={`gx-dome comic-dots relative z-10 mx-auto aspect-square w-[92%] overflow-hidden rounded-full border-4 border-ink ${spinning ? "is-spinning" : ""}`}>
        <span aria-hidden className="absolute top-[9%] left-1/2 -translate-x-1/2 font-condensed text-3xl font-black text-ink uppercase italic">
          ROBOTICA
        </span>
        {PILE.map((item, index) => (
          <span
            key={index}
            className="gx-pile-capsule absolute"
            style={{
              left: `${item.left}%`,
              top: `${item.top}%`,
              ...vars({ "--r": `${item.rotate}deg`, "--tx": `${((index % 5) - 2) * 9}px`, "--d": `${(index % 6) * 0.05}s` }),
            }}
          >
            <Capsule rarity={item.rarity} size={50} />
          </span>
        ))}
        <span aria-hidden className="absolute top-[14%] left-[13%] h-[36%] w-[9%] -rotate-[28deg] rounded-full bg-white/70" />
      </div>
      <span
        aria-hidden
        className="absolute top-2 right-0 z-20 grid size-24 rotate-12 place-items-center rounded-full border-3 border-ink bg-[#ffd23f] text-center font-condensed text-base leading-none font-black text-ink uppercase italic shadow-[3px_3px_0_var(--color-ink)]"
      >
        Tỷ lệ
        <br />
        công khai
      </span>

      <div className="relative z-0 -mt-12 border-4 border-ink bg-brand px-4 pt-14 pb-4 text-white shadow-[8px_8px_0_var(--color-ink)]">
        <div className="flex items-start justify-between gap-3">
          <p className="font-condensed text-3xl leading-none font-black uppercase italic">
            {series.short}
            <span className="mt-1 block text-xs font-bold not-italic">
              {series.theme} · {series.cards.length} thẻ
            </span>
          </p>
          <div className="flex flex-col items-center gap-1">
            <span aria-hidden className={`gx-knob grid size-[4.5rem] place-items-center rounded-full border-4 border-ink bg-[#ffd23f] ${spinning ? "is-spinning" : ""}`}>
              <span className="h-3.5 w-12 rounded-full border-3 border-ink bg-surface" />
            </span>
            <span className="font-condensed text-xs font-black uppercase">Quay!</span>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="relative h-20 w-40 overflow-hidden rounded-t-[1.75rem] border-4 border-ink bg-ink" aria-label="Cửa ra viên nang">
            <span aria-hidden className="absolute inset-x-2 top-1.5 h-1.5 rounded-full bg-white/15" />
            {outlet.map((rarity, index) => (
              <span
                key={index}
                className="gx-drop absolute"
                style={{ left: `${4 + (index % 5) * 19}%`, bottom: index < 5 ? 4 : 30, ...vars({ "--d": `${index * 0.12}s` }) }}
              >
                <Capsule rarity={rarity} size={outlet.length > 1 ? 30 : 44} />
              </span>
            ))}
          </div>
          <p className="border-3 border-ink bg-surface px-3 py-1.5 text-center font-condensed text-ink" role="status">
            <span className="block text-[11px] font-bold uppercase">Xu của bạn</span>
            <b className="text-2xl tabular-nums">{coins === null ? "—" : coins.toLocaleString("vi-VN")}</b>
          </p>
        </div>
      </div>
    </div>
  );
}
