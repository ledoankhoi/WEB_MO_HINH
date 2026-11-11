"use client";

import { useEffect, useRef, useState, useTransition, type ComponentProps, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import { Hand, Ticket } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX, BOX_LG, SectionHeading } from "@/components/store/StoreKit";
import { DUPLICATE_SHARDS, PACK_COST, PACK_SIZE, RARITY_INFO, guaranteedRate, type GachaSeries, type PullResult, type Rarity } from "@/lib/gacha";
import { Celebration, RarityBurst } from "./Fx";
import { CardBack, CardFace, type CardView } from "./GachaCard";

// Mở gói thẻ kiểu TCG: mua gói (máy chủ quay sẵn 5 thẻ), kéo ngang dọc mép trên để xé gói (hoặc bấm "Xé gói ngay",
// phím mũi tên, Enter), mép gói bay đi, 5 thẻ úp được chia ra; khách chạm từng thẻ để lật (hoặc "Lật tất cả"). Thẻ từ
// Hiếm trở lên có viền vàng lấp lánh trước khi lật.

const vars = (values: Record<string, string>) => values as CSSProperties;
type Phase = "shop" | "sealed" | "torn" | "dealt";
const TEAR_DONE = 0.92;
const RANK: Record<Rarity, number> = { common: 0, rare: 1, super: 2, secret: 3 };
const percent = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export function PackOpener({
  series,
  cards,
  coins,
  loggedIn,
  packImage,
  onBuy,
  onOpened,
}: {
  series: GachaSeries;
  cards: Record<string, CardView>;
  coins: number | null;
  loggedIn: boolean;
  packImage: string | null;
  // Mua một gói: trả 5 thẻ, hoặc null khi lỗi (khung cha hiện lời báo).
  onBuy: () => Promise<PullResult[] | null>;
  // Đã lật hết thẻ của gói: khung cha làm mới số liệu và bộ sưu tập.
  onOpened: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("shop");
  const [results, setResults] = useState<PullResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [flipped, setFlipped] = useState<boolean[]>([]);
  const [celebration, setCelebration] = useState<{ rarity: "super" | "secret"; key: number } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();
  const dragging = useRef(false);
  const tearing = useRef(false);
  const flippedSet = useRef(new Set<number>());
  const reported = useRef(true);
  const timers = useRef<number[]>([]);
  const allFlipped = results.length > 0 && flipped.every(Boolean);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((timer) => window.clearTimeout(timer));
  }, []);
  useEffect(() => {
    if (allFlipped && !reported.current) {
      reported.current = true;
      onOpened();
    }
  }, [allFlipped, onOpened]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const buy = () =>
    startTransition(async () => {
      const outcome = await onBuy();
      if (!outcome) return;
      reported.current = false;
      tearing.current = false;
      flippedSet.current = new Set();
      setResults(outcome);
      setFlipped(outcome.map(() => false));
      setProgress(0);
      setCelebration(null);
      setPhase("sealed");
      setAnnouncement("Đã mua gói. Kéo ngang dọc mép trên để xé gói, hoặc bấm Xé gói ngay.");
    });

  const tearDone = () => {
    if (tearing.current) return;
    tearing.current = true;
    setProgress(1);
    setPhase("torn");
    later(() => setPhase("dealt"), 950);
  };

  const tearTo = (value: number) => {
    if (tearing.current) return;
    setProgress((current) => Math.max(current, Math.min(1, value)));
    if (value >= TEAR_DONE) tearDone();
  };

  // Xé tự động (nút, phím Enter): mép rách chạy hết chiều ngang trong ~0,45 giây.
  const autoTear = () => {
    if (phase !== "sealed" || tearing.current) return;
    const from = progress;
    const begin = performance.now();
    const step = (now: number) => {
      if (tearing.current) return;
      const value = from + (1 - from) * Math.min(1, (now - begin) / 450);
      setProgress(value);
      if (value < 1) requestAnimationFrame(step);
      else tearDone();
    };
    requestAnimationFrame(step);
  };

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    tearTo((event.clientX - rect.left) / rect.width);
  };
  const zone: ComponentProps<"div"> = {
    role: "slider",
    tabIndex: phase === "sealed" ? 0 : -1,
    "aria-label": "Kéo ngang để xé gói",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(progress * 100),
    "aria-disabled": phase !== "sealed",
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (phase !== "sealed") return;
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      fromPointer(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (dragging.current) fromPointer(event);
    },
    onPointerUp: () => {
      dragging.current = false;
    },
    onPointerCancel: () => {
      dragging.current = false;
    },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (phase !== "sealed") return;
      if (event.key === "ArrowRight") tearTo(progress + 0.25);
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        autoTear();
      }
    },
  };

  const flip = (index: number) => {
    if (flippedSet.current.has(index)) return;
    flippedSet.current.add(index);
    setFlipped((current) => current.map((value, i) => (i === index ? true : value)));
    const result = results[index];
    later(() => {
      setAnnouncement(`${RARITY_INFO[result.rarity].label}: ${cards[result.card]?.name ?? result.card}`);
      const rarity = result.rarity;
      if (rarity === "super" || rarity === "secret") {
        setCelebration((current) => (current && RANK[current.rarity] > RANK[rarity] ? current : { rarity, key: index }));
        later(() => setCelebration((current) => (current?.key === index ? null : current)), 3600);
      }
    }, 380);
  };
  const flipAll = () => results.forEach((_, index) => later(() => flip(index), index * 230));

  const enough = coins !== null && coins >= PACK_COST;
  const shardTotal = results.reduce((sum, result) => sum + result.shards, 0);
  const fresh = results.filter((result) => !result.duplicate).length;
  const instruction =
    phase === "sealed"
      ? "Kéo ngang dọc đường đứt ở mép trên để xé gói."
      : phase === "torn"
        ? "Rẹt!"
        : loggedIn
          ? `Mỗi gói ${PACK_COST} xu. Xu kiếm từ nhiệm vụ và đơn hàng.`
          : "Đăng nhập để mở gói.";

  const buyButton = !loggedIn ? (
    <Link
      href="/dang-nhap?next=/gacha"
      className="flex h-14 items-center justify-center border-3 border-ink bg-brand font-condensed text-xl font-black text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)]"
    >
      Đăng nhập để mở gói
    </Link>
  ) : (
    <button
      type="button"
      onClick={buy}
      disabled={pending || !enough}
      className="flex h-14 w-full flex-col items-center justify-center border-3 border-ink bg-brand font-condensed text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-xl leading-none font-black">{phase === "dealt" ? "Mở gói tiếp" : "Mua và mở gói"}</span>
      <span className="text-xs font-bold not-italic">{enough || pending ? `${PACK_COST} xu · ${PACK_SIZE} thẻ` : `Cần ${PACK_COST} xu, bạn có ${coins ?? 0}`}</span>
    </button>
  );

  return (
    <div className="space-y-10">
      <section className={`grid gap-7 bg-surface p-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:p-7 ${BOX_LG}`}>
        <div className="flex flex-col items-center gap-4">
          {phase === "sealed" || phase === "torn" ? (
            <PackArt key="opening" label={series.short} image={packImage} progress={progress} state={phase === "torn" ? "torn" : "ready"} zone={zone} />
          ) : (
            <PackArt key="shelf" label={series.short} image={packImage} progress={0} state="idle" />
          )}
          <p className="text-center text-sm font-semibold" aria-live="polite">
            {instruction}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className={`p-4 ${BOX}`}>
            <p className="font-condensed text-xl font-black uppercase italic">Trong mỗi gói {PACK_SIZE} thẻ</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li>• {PACK_SIZE - 1} thẻ ngẫu nhiên theo tỷ lệ công khai.</li>
              <li>
                • Thẻ thứ {PACK_SIZE} <b>chắc chắn từ Hiếm trở lên</b>: Hiếm {percent(guaranteedRate("rare"))}%, Siêu hiếm {percent(guaranteedRate("super"))}%,
                Bí mật {percent(guaranteedRate("secret"))}%.
              </li>
              <li>
                • Thẻ trùng thành <b>mảnh ghép</b> ({DUPLICATE_SHARDS.common} đến {DUPLICATE_SHARDS.secret} mảnh) để ghép thẻ còn thiếu.
              </li>
              <li>• Thẻ Hiếm trở lên kèm mã giảm giá dùng một lần.</li>
            </ul>
          </div>
          {phase === "sealed" ? (
            <button
              type="button"
              onClick={autoTear}
              className="h-14 border-3 border-ink bg-[#ffd23f] font-condensed text-xl font-black uppercase italic shadow-[4px_4px_0_var(--color-ink)]"
            >
              Xé gói ngay
            </button>
          ) : (
            buyButton
          )}
          <p className="text-xs text-muted">
            Muốn quay lẻ? Chuyển sang <b>Máy quay</b>: 1 lượt 100 xu, có 1 lượt miễn phí mỗi ngày.
          </p>
        </div>
      </section>

      {results.length > 0 && phase !== "shop" && phase !== "sealed" && (
        <section aria-labelledby="goi-vua-mo" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading id="goi-vua-mo">Gói vừa mở</SectionHeading>
            {!allFlipped && (
              <button
                type="button"
                onClick={flipAll}
                className="h-11 border-3 border-ink bg-surface px-5 font-condensed text-base font-black uppercase italic shadow-[3px_3px_0_var(--color-ink)]"
              >
                Lật tất cả
              </button>
            )}
          </div>
          <p className="text-sm text-muted">
            {allFlipped
              ? `${fresh > 0 ? `${fresh} thẻ mới vào bộ sưu tập.` : "Toàn thẻ đã có."}${shardTotal > 0 ? ` Nhận ${shardTotal} mảnh ghép.` : ""}`
              : "Chạm từng thẻ để lật. Thẻ có viền vàng lấp lánh là thẻ từ Hiếm trở lên."}
          </p>
          <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((result, index) => {
              const card = cards[result.card];
              const isFlipped = flipped[index];
              return (
                <li key={index} className="relative isolate">
                  {isFlipped && <RarityBurst rarity={result.rarity} />}
                  <button
                    type="button"
                    onClick={() => flip(index)}
                    disabled={isFlipped}
                    className={`gx-flip gx-deal block aspect-[5/7] w-full disabled:cursor-default ${isFlipped ? "is-flipped" : ""}`}
                    style={vars({ "--d": `${index * 0.09}s`, "--fx": `${(2 - index) * 46}px` })}
                    aria-label={isFlipped && card ? `${card.name}, ${RARITY_INFO[result.rarity].label}` : `Lật thẻ ${index + 1}`}
                  >
                    <span className="gx-flip-inner block size-full">
                      <span className="gx-face block">
                        <CardBack glow={result.rarity !== "common"} />
                      </span>
                      <span className="gx-face gx-face-front block">{card && <CardFace card={card} size="md" />}</span>
                    </span>
                  </button>
                  {isFlipped && (
                    <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 font-condensed text-xs font-extrabold uppercase">
                      {result.duplicate ? (
                        <span className="border-2 border-ink/30 px-1.5">Trùng · +{result.shards} mảnh</span>
                      ) : (
                        <span className="border-2 border-ink bg-[#ffd23f] px-1.5">Mới!</span>
                      )}
                      {result.couponCode && (
                        <span className="flex items-center gap-1 border-2 border-dashed border-brand px-1.5 text-brand-strong" title={result.voucher ?? undefined}>
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
        </section>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {celebration && <Celebration key={celebration.key} rarity={celebration.rarity} />}
    </div>
  );
}

// Bao gói thẻ: mép trên (xé ra), đường xé (vùng kéo), thân gói ánh kim với robot Siêu hiếm làm hình.
function PackArt({
  label,
  image,
  progress,
  state,
  zone,
}: {
  label: string;
  image: string | null;
  progress: number;
  state: "idle" | "ready" | "torn";
  zone?: ComponentProps<"div">;
}) {
  return (
    <div className={`gx-pack relative w-52 select-none ${state === "torn" ? "is-opened" : ""} ${state === "idle" ? "gx-pack-float" : ""}`}>
      <div
        className={`gx-flap relative z-10 ${state === "torn" ? "is-torn" : ""}`}
        style={state === "torn" ? undefined : { transform: `rotate(${-progress * 9}deg) translateY(${-progress * 9}px)` }}
      >
        <div className="gx-crimp" />
        <div className="gx-foil flex h-9 items-center justify-center border-x-3 border-ink bg-brand font-condensed text-[11px] font-black tracking-[0.2em] text-white uppercase">
          ROBOTICA · {label}
        </div>
      </div>
      <div
        {...zone}
        className={`relative z-20 h-8 border-x-3 border-ink bg-brand outline-none focus-visible:ring-4 focus-visible:ring-[#ffd23f] ${state === "ready" ? "gx-tear-zone" : ""}`}
      >
        <span aria-hidden className="absolute inset-x-2 top-1/2 border-t-2 border-dashed border-white/75" />
        <span
          aria-hidden
          className="absolute top-1/2 left-0 h-2.5 -translate-y-1/2 border-y-2 border-ink bg-[repeating-linear-gradient(90deg,#fff_0_6px,#ffe9a8_6px_12px)]"
          style={{ width: `${progress * 100}%` }}
        />
        {state === "ready" && progress === 0 && (
          <Hand aria-hidden className="gx-tear-hint absolute top-1 left-1 size-6 text-white" style={vars({ "--w": "150px" })} />
        )}
      </div>
      <div className="gx-foil relative border-x-3 border-ink bg-brand px-3 pt-2 pb-4 text-center text-white">
        <p className="font-condensed text-[2.6rem] leading-[0.85] font-black uppercase italic">{label}</p>
        <div className="halftone mx-auto my-3 aspect-square w-36 overflow-hidden rounded-full border-3 border-ink">
          <ProductImage src={image} alt="" className="size-full p-2" />
        </div>
        <p className="font-condensed text-sm font-extrabold uppercase">Gói {PACK_SIZE} thẻ</p>
        <p className="font-condensed text-xl leading-tight font-black text-[#ffd23f] uppercase italic">Chắc chắn 1 thẻ Hiếm+</p>
      </div>
      <div className="gx-crimp gx-crimp-bottom" />
    </div>
  );
}
