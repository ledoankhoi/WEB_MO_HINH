"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Rarity } from "@/lib/gacha";

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

const CONFETTI: Record<"super" | "secret", string[]> = {
  super: ["#d7261e", "#ffd23f", "#ffffff", "#111111"],
  secret: ["#ff3ea5", "#ffd23f", "#1fb6ff", "#2bd86f", "#8a5cff", "#ffffff"],
};

// Ăn mừng thẻ Siêu hiếm (pháo giấy) và Bí mật (pháo giấy dày hơn và một lần chớp sáng). Gắn `key` mới để chạy lại.
export function Celebration({ rarity }: { rarity: "super" | "secret" }) {
  if (typeof document === "undefined") return null;
  const colors = CONFETTI[rarity];
  const pieces = rarity === "secret" ? 70 : 36;
  return createPortal(
    <div aria-hidden>
      {rarity === "secret" && <div className="gx-flash" />}
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
    document.body,
  );
}
