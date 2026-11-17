"use client";

import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { RARITY_INFO, type Rarity } from "@/lib/gacha";

// Hiệu ứng khi ra thẻ: tia sáng xoay sau thẻ, vòng sóng, ngôi sao bắn ra (Hiếm trở lên); pháo giấy (Siêu hiếm, Bí mật);
// chớp sáng một lần (Bí mật). Giá trị "ngẫu nhiên" tính theo chỉ số để lần dựng nào cũng giống nhau.

const vars = (values: Record<string, string>) => values as CSSProperties;

const SPARKS: Record<Exclude<Rarity, "common">, { ray: string; ring: string; colors: string[] }> = {
  rare: { ray: "rgb(31 79 216 / 0.35)", ring: "#1f4fd8", colors: ["#1f4fd8", "#9fc0ff", "#ffffff"] },
  super: { ray: "rgb(215 38 30 / 0.4)", ring: "#d7261e", colors: ["#d7261e", "#ffd23f", "#ffffff"] },
  secret: { ray: "transparent", ring: "#ffd23f", colors: ["#ff3ea5", "#ffd23f", "#1fb6ff", "#2bd86f", "#8a5cff"] },
};

// Đặt phía sau thẻ, trong khung cha `relative isolate`.
export function RarityBurst({ rarity }: { rarity: Rarity }) {
  if (rarity === "common") return null;
  const spark = SPARKS[rarity];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className={`gx-rays ${rarity === "secret" ? "gx-rays-rainbow" : ""}`} style={vars({ "--ray": spark.ray })} />
      <div className="gx-ring" style={vars({ "--ray": spark.ring })} />
      {Array.from({ length: 14 }, (_, index) => (
        <span
          key={index}
          className="gx-sparkle"
          style={vars({
            "--a": `${index * (360 / 14)}deg`,
            "--r": `${110 + (index % 3) * 34}px`,
            "--c": spark.colors[index % spark.colors.length],
            "--d": `${(index % 4) * 0.07}s`,
          })}
        />
      ))}
    </div>
  );
}

// Bọc vật sắp mở (viên nang, hộp mù, mặt sau thẻ) trong lúc "nạp năng lượng" (src/lib/gacha-fx.ts): tier 0 là đứng yên,
// 1–3 rung và sáng theo cấp, mỗi lần lên cấp toả một vòng sóng. `color`: màu sáng cố định (viên nang đã lộ màu);
// không truyền thì đổi màu theo cấp. Luôn là một thẻ span để nội dung bên trong không bị dựng lại khi đổi cấp.
export function Charge({
  tier,
  color,
  square = false,
  className = "",
  children,
}: {
  tier: number;
  color?: string;
  // Vòng sóng vuông (thẻ, hộp) thay vì tròn (viên nang).
  square?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const active = tier > 0;
  return (
    <span
      className={`${active ? "gx-charge" : ""} ${className}`}
      data-tier={active ? tier : undefined}
      style={active ? vars({ ...(color ? { "--tc": color } : {}), ...(square ? { "--ring-radius": "0px" } : {}) }) : undefined}
    >
      {children}
      {active && <span key={tier} aria-hidden className="gx-tier-ring" />}
    </span>
  );
}

const CONFETTI: Record<"super" | "secret", string[]> = {
  super: ["#d7261e", "#ffd23f", "#ffffff", "#111111"],
  secret: ["#ff3ea5", "#ffd23f", "#1fb6ff", "#2bd86f", "#8a5cff", "#ffffff"],
};

// Ăn mừng thẻ Siêu hiếm (pháo giấy) và Bí mật (pháo giấy dày hơn và một lần chớp sáng). Gắn `key` mới để chạy lại.
// `name`: tên thẻ, đóng dấu xuống giữa màn hình rồi tự mờ đi.
export function Celebration({ rarity, name }: { rarity: "super" | "secret"; name?: string }) {
  if (typeof document === "undefined") return null;
  const colors = CONFETTI[rarity];
  const pieces = rarity === "secret" ? 70 : 36;
  return createPortal(
    <div aria-hidden>
      {rarity === "secret" && <div className="gx-flash" />}
      {name && (
        <div className="gx-stamp-layer">
          <div className={`gx-stamp shadow-[6px_6px_0_#000] ${rarity === "secret" ? "gx-rainbow-frame p-1" : ""}`}>
            <p
              className={`border-4 border-ink px-5 py-2 text-center font-condensed font-black uppercase italic ${rarity === "secret" ? "bg-ink text-[#ffd23f]" : "bg-brand text-white"}`}
            >
              <span className="block text-sm tracking-[0.25em] not-italic">{RARITY_INFO[rarity].label}!</span>
              <span className="block text-3xl leading-tight sm:text-5xl">{name}</span>
            </p>
          </div>
        </div>
      )}
      {Array.from({ length: pieces }, (_, index) => (
        <span
          key={index}
          className="gx-confetti"
          style={vars({
            "--x": `${(index * 37 + 11) % 100}vw`,
            "--c": colors[index % colors.length],
            "--t": `${1.7 + (index % 5) * 0.28}s`,
            "--d": `${(index % 12) * 0.05}s`,
            "--rot": `${(index % 2 ? 1 : -1) * (380 + ((index * 53) % 340))}deg`,
            "--drift": `${((index % 9) - 4) * 22}px`,
          })}
        />
      ))}
    </div>,
    // Gắn vào khung cửa hàng (không phải body) để dấu tên thẻ dùng đúng màu và phông chữ của cửa hàng (.store-skin).
    document.querySelector(".store-skin") ?? document.body,
  );
}
