"use client";

import { useEffect, useRef, useState } from "react";
import { Ticket } from "lucide-react";
import { RARITY_INFO, type PullResult, type Rarity } from "@/lib/gacha";
import { BoxArt } from "./BoxArt";
import { Capsule } from "./CapsuleMachine";
import { Celebration, RarityBurst } from "./Fx";
import { CardFace, type CardView } from "./GachaCard";

// Màn mở viên nang sau khi máy quay: nền tối, khách chạm từng viên nang (hoặc "Mở tất cả"), viên nang tách đôi, thẻ bay
// ra và lật lên kèm hiệu ứng theo độ hiếm. Esc: chưa mở hết thì mở hết, đã mở hết thì đóng.

type SlotState = "closed" | "opening" | "open";
const RANK: Record<Rarity, number> = { common: 0, rare: 1, super: 2, secret: 3 };
const OPEN_MS = 420;

export function RevealStage({
  results,
  cards,
  onClose,
  kind = "capsule",
}: {
  results: (PullResult & { slot?: number })[];
  cards: Record<string, CardView>;
  onClose: () => void;
  // capsule: viên nang của máy quay; box: hộp mù (mua cả kệ).
  kind?: "capsule" | "box";
}) {
  const [slots, setSlots] = useState<SlotState[]>(() => results.map(() => "closed"));
  const [celebration, setCelebration] = useState<{ rarity: "super" | "secret"; key: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const started = useRef(new Set<number>());
  const timers = useRef<number[]>([]);
  const single = results.length === 1;
  const allOpen = slots.every((slot) => slot === "open");

  useEffect(() => {
    dialog.current?.focus();
    const list = timers.current;
    return () => list.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const open = (index: number) => {
    if (started.current.has(index)) return;
    started.current.add(index);
    setSlots((current) => current.map((slot, i) => (i === index ? "opening" : slot)));
    later(() => {
      setSlots((current) => current.map((slot, i) => (i === index ? "open" : slot)));
      const result = results[index];
      setAnnouncement(`${RARITY_INFO[result.rarity].label}: ${cards[result.card]?.name ?? result.card}${result.duplicate ? ", thẻ trùng" : ", thẻ mới"}`);
      const rarity = result.rarity;
      if (rarity === "super" || rarity === "secret") {
        // Mở nhiều viên cùng lúc thì chỉ ăn mừng thẻ hiếm nhất.
        setCelebration((current) => (current && RANK[current.rarity] > RANK[rarity] ? current : { rarity, key: index }));
        later(() => setCelebration((current) => (current?.key === index ? null : current)), 3600);
      }
    }, OPEN_MS);
  };

  const openAll = () => results.forEach((_, index) => later(() => open(index), index * 170));

  const shards = results.reduce((sum, result) => sum + result.shards, 0);
  const fresh = results.filter((result) => !result.duplicate).length;
  const coupons = results.filter((result) => result.couponCode);

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={kind === "box" ? "Mở hộp mù" : "Mở viên nang"}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (allOpen) onClose();
        else openAll();
      }}
      className="fixed inset-0 z-[60] overflow-y-auto bg-ink/92 text-white outline-none"
      style={{ backgroundImage: "radial-gradient(circle at 50% 38%, rgb(255 255 255 / 0.16), transparent 62%)" }}
    >
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-7 px-4 py-10">
        <p className="text-center font-condensed text-3xl font-black uppercase italic sm:text-4xl">
          {allOpen ? "Bạn nhận được" : kind === "box" ? "Chạm từng hộp, hoặc mở tất cả" : single ? "Chạm vào viên nang để mở" : "Chạm từng viên nang, hoặc mở tất cả"}
        </p>

        <ul className={single ? "w-60 sm:w-72" : `grid w-full grid-cols-3 gap-x-5 gap-y-9 ${results.length > 10 ? "sm:grid-cols-6" : "sm:grid-cols-5"}`}>
          {results.map((result, index) => {
            const card = cards[result.card];
            const state = slots[index];
            const big = result.rarity === "super" || result.rarity === "secret";
            return (
              <li key={index} className="relative isolate">
                <button
                  type="button"
                  onClick={() => open(index)}
                  disabled={state !== "closed"}
                  className="relative block aspect-[5/7] w-full disabled:cursor-default"
                  aria-label={state === "open" && card ? `${card.name}, ${RARITY_INFO[result.rarity].label}` : kind === "box" ? `Mở hộp số ${(result.slot ?? index) + 1}` : `Mở viên nang ${index + 1}`}
                >
                  {state === "open" && card ? (
                    <>
                      <RarityBurst rarity={result.rarity} />
                      <span className="gx-emerge absolute inset-0 block">
                        <span className={`block size-full ${big ? "gx-shake-once" : ""}`} style={big ? { animationDelay: "0.6s" } : undefined}>
                          <CardFace card={card} size={single ? "lg" : "sm"} />
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="absolute inset-0 grid place-items-center">
                      {kind === "box" ? (
                        <span className="block w-[86%]">
                          <BoxArt slot={result.slot ?? index} label={card?.series ?? ""} small={!single} lidOpen={state === "opening"} />
                        </span>
                      ) : (
                        <Capsule rarity={result.rarity} size={single ? 180 : 80} open={state === "opening"} waiting={state === "closed"} />
                      )}
                    </span>
                  )}
                </button>
                {state === "open" && (
                  <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 font-condensed text-xs font-extrabold uppercase">
                    {result.duplicate ? (
                      <span className="border-2 border-white/40 px-1.5">Trùng · +{result.shards} mảnh</span>
                    ) : (
                      <span className="border-2 border-ink bg-[#ffd23f] px-1.5 text-ink">Mới!</span>
                    )}
                    {result.couponCode && (
                      <span className="flex items-center gap-1 border-2 border-dashed border-[#ffd23f] px-1.5 text-[#ffd23f]" title={result.voucher ?? undefined}>
                        <Ticket className="size-3.5" aria-hidden />
                        {result.couponCode}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {allOpen ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-white/80">
              {fresh > 0 ? `${fresh} thẻ mới vào bộ sưu tập.` : "Toàn thẻ đã có."}
              {shards > 0 && ` Nhận ${shards} mảnh ghép.`}
              {coupons.length > 0 && ` ${coupons.length} mã giảm giá, dùng ở trang thanh toán.`}
            </p>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="h-12 border-3 border-ink bg-[#ffd23f] px-10 font-condensed text-xl font-black text-ink uppercase italic shadow-[4px_4px_0_#000]"
            >
              Tiếp tục
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openAll}
            className="h-12 border-3 border-white bg-transparent px-8 font-condensed text-lg font-black uppercase italic hover:bg-white hover:text-ink"
          >
            {single ? "Mở luôn" : "Mở tất cả"}
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
      {celebration && <Celebration key={celebration.key} rarity={celebration.rarity} />}
    </div>
  );
}
