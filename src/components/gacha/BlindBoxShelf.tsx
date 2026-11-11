"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { BoxActionResult, BoxBatchActionResult } from "@/app/actions/gacha";
import { BOX, BOX_LG } from "@/components/store/StoreKit";
import { BOX_COST, DUPLICATE_SHARDS, RARITY_INFO, type GachaSeries, type PullResult } from "@/lib/gacha";
import { Celebration, RarityBurst } from "./Fx";
import { RevealStage } from "./RevealStage";
import { BoxArt } from "./BoxArt";
import { CardFace, type CardView } from "./GachaCard";

// Hộp mù: kệ 12 hộp (3 tầng × 4), kệ chứa đủ 12 thẻ của series theo thứ tự máy chủ xếp sẵn. Chọn một hộp: hộp phóng to
// trên nền tối, "Lắc thử" cho vui (không lộ gì), "Mở hộp" thì nắp bật tung và thẻ trồi lên kèm hiệu ứng theo độ hiếm.
// Hộp đã mở hiện thẻ đứng trên kệ.

type Stage = { slot: number; phase: "pick" | "shaking" | "opening" | "open"; result: PullResult | null };

export function BlindBoxShelf({
  series,
  slots,
  cards,
  coins,
  loggedIn,
  onOpen,
  onDone,
  onOpenAll,
  ownedCount,
}: {
  series: GachaSeries;
  // Mã thẻ đã mở ở từng vị trí, null là hộp còn niêm phong.
  slots: (string | null)[];
  cards: Record<string, CardView>;
  coins: number | null;
  loggedIn: boolean;
  onOpen: (slot: number) => Promise<BoxActionResult>;
  // Đóng màn mở hộp sau khi đã mở: khung cha làm mới số liệu (kệ, bộ sưu tập).
  onDone: () => void;
  // Mua và mở một lúc mọi hộp còn niêm phong.
  onOpenAll: () => Promise<BoxBatchActionResult>;
  // Số thẻ khác nhau khách đã có trong bộ sưu tập.
  ownedCount: number;
}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDivElement>(null);
  const opened = slots.filter(Boolean).length;
  const sealed = slots.length - opened;
  // Mọi thẻ khách chưa có đều nằm trong các hộp chưa mở của kệ (hộp đã mở thì thẻ đã vào bộ sưu tập).
  const newForYou = Math.max(0, series.cards.length - ownedCount);
  const [batch, setBatch] = useState<(PullResult & { slot: number })[] | null>(null);
  const buyAll = () =>
    startTransition(async () => {
      setMessage("");
      const outcome = await onOpenAll();
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      setFinished(outcome.finished);
      setBatch(outcome.results);
    });
  const enough = (coins ?? 0) >= BOX_COST;

  useEffect(() => {
    if (stage) dialog.current?.focus();
  }, [stage]);

  const pick = (slot: number) => {
    setMessage("");
    setStage({ slot, phase: "pick", result: null });
  };
  const shake = () => {
    if (!stage || stage.phase !== "pick") return;
    setStage({ ...stage, phase: "shaking" });
    window.setTimeout(() => setStage((current) => (current?.phase === "shaking" ? { ...current, phase: "pick" } : current)), 780);
  };
  const open = () =>
    startTransition(async () => {
      if (!stage) return;
      const slot = stage.slot;
      setMessage("");
      const outcome = await onOpen(slot);
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      setFinished(outcome.finished);
      setStage({ slot, phase: "opening", result: outcome.result });
      window.setTimeout(() => setStage((current) => (current?.slot === slot ? { ...current, phase: "open" } : current)), 620);
    });
  const close = () => {
    const wasOpened = stage?.result !== null;
    setStage(null);
    if (wasOpened) onDone();
  };

  const result = stage?.result ?? null;
  const card = result ? cards[result.card] : null;
  const big = result?.rarity === "super" || result?.rarity === "secret";

  return (
    <div className="space-y-6">
      <div className={`grid gap-6 bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_15rem] ${BOX_LG}`}>
        <div>
          <p className="mb-3 font-condensed text-sm font-black uppercase">
            Kệ của bạn · đã mở {opened}/{slots.length}
          </p>
          {/* Kệ: mỗi tầng 4 hộp đứng trên một thanh gỗ. */}
          <ul className={`grid gap-x-3 gap-y-0 ${slots.length === 10 ? "grid-cols-5" : "grid-cols-4"}`}>
            {slots.map((key, slot) => {
              const shelfCard = key ? cards[key] : null;
              return (
                <li key={slot} className="border-b-8 border-ink pt-4 pb-1">
                  {shelfCard ? (
                    <div className="mx-auto aspect-[5/7] w-[88%]" title={shelfCard.name}>
                      <CardFace card={shelfCard} size="sm" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pick(slot)}
                      className="block w-full"
                      aria-label={`Hộp số ${slot + 1}, còn niêm phong`}
                    >
                      <BoxArt slot={slot} label={series.short} small />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="space-y-4">
          <div className={`space-y-2 p-4 text-sm ${BOX}`}>
            <p className="font-condensed text-xl font-black uppercase italic">Luật hộp mù</p>
            <p>
              Kệ có {series.cards.length} hộp chứa <b>đủ {series.cards.length} thẻ</b> của {series.short}, mỗi thẻ một hộp, kể cả thẻ Bí mật. Mở hết kệ là chắc đủ
              bộ.
            </p>
            <p>
              Mỗi hộp <b>{BOX_COST} xu</b>. Thẻ trùng với bộ sưu tập thành mảnh ghép ({DUPLICATE_SHARDS.common} đến {DUPLICATE_SHARDS.secret} mảnh).
            </p>
            <p className="text-xs text-muted">Hộp mù không kèm mã giảm giá và không tính vào bảo hiểm của máy quay. Mở hết kệ thì có kệ mới.</p>
          </div>
          {!loggedIn && (
            <Link
              href="/dang-nhap?next=/gacha"
              className="flex h-12 items-center justify-center border-3 border-ink bg-brand font-condensed text-lg font-black text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)]"
            >
              Đăng nhập để mở hộp
            </Link>
          )}
          {loggedIn && sealed > 0 && (
            <div className={`space-y-2 p-4 ${BOX}`}>
              <p className="text-sm">
                Bạn đã có <b>{ownedCount}/{series.cards.length}</b> thẻ.{" "}
                {newForYou === 0 ? (
                  <>
                    {sealed} hộp còn niêm phong <b>toàn thẻ bạn đã có</b>: mở ra là thẻ trùng, đổi thành mảnh ghép.
                  </>
                ) : newForYou >= sealed ? (
                  <>
                    {sealed} hộp còn niêm phong <b>đều là thẻ bạn chưa có</b>.
                  </>
                ) : (
                  <>
                    {sealed} hộp còn niêm phong có <b>{newForYou} thẻ bạn chưa có</b>; {sealed - newForYou} hộp còn lại ra thẻ trùng (đổi thành mảnh ghép).
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={buyAll}
                disabled={pending || (coins ?? 0) < sealed * BOX_COST}
                className="gx-ready flex h-14 w-full flex-col items-center justify-center border-3 border-ink bg-brand font-condensed text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)] disabled:animate-none disabled:opacity-55"
              >
                <span className="text-xl leading-none font-black">Mua cả kệ</span>
                <span className="text-xs font-bold not-italic">
                  {sealed} hộp · {(sealed * BOX_COST).toLocaleString("vi-VN")} xu
                </span>
              </button>
              {(coins ?? 0) < sealed * BOX_COST && <p className="text-xs text-muted">Bạn có {(coins ?? 0).toLocaleString("vi-VN")} xu.</p>}
              {message && !stage && (
                <p className="border-2 border-ink bg-[#fff3a8] px-2 py-1 text-xs font-semibold" role="alert">
                  {message}
                </p>
              )}
            </div>
          )}
          {finished && <p className="border-3 border-ink bg-[#fff3a8] p-3 text-sm font-semibold">Bạn đã mở hết kệ! Một kệ mới vừa được xếp lên.</p>}
        </div>
      </div>

      {batch && (
        <RevealStage
          kind="box"
          results={batch}
          cards={cards}
          onClose={() => {
            setBatch(null);
            onDone();
          }}
        />
      )}

      {stage && (
        <div
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={`Hộp số ${stage.slot + 1}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending && stage.phase !== "opening") close();
          }}
          className="fixed inset-0 z-[60] overflow-y-auto bg-ink/92 text-white outline-none"
          style={{ backgroundImage: "radial-gradient(circle at 50% 40%, rgb(255 255 255 / 0.16), transparent 62%)" }}
        >
          <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
            <p className="font-condensed text-3xl font-black uppercase italic">
              {stage.phase === "open" ? "Bạn mở được" : `Hộp số ${stage.slot + 1}`}
            </p>
            <div className="relative isolate w-64">
              {stage.phase === "open" && result && <RarityBurst rarity={result.rarity} />}
              {(stage.phase === "opening" || stage.phase === "open") && card && (
                <div className="gx-rise absolute inset-x-6 bottom-[18%] z-20 aspect-[5/7]">
                  <div className={`size-full ${big && stage.phase === "open" ? "gx-shake-once" : ""}`}>
                    <CardFace card={card} size="md" />
                  </div>
                </div>
              )}
              <div className={stage.phase === "shaking" ? "gx-box-shake" : ""}>
                <BoxArt slot={stage.slot} label={series.short} lidOpen={stage.phase === "opening" || stage.phase === "open"} faded={stage.phase === "open"} />
              </div>
            </div>
            {stage.phase === "open" && result && card ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="font-condensed text-2xl font-black uppercase italic">{card.name}</p>
                <p className="text-sm text-white/80">
                  {RARITY_INFO[result.rarity].label}
                  {result.duplicate ? ` · trùng, +${result.shards} mảnh ghép` : " · thẻ mới vào bộ sưu tập!"}
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={close}
                  className="h-12 border-3 border-ink bg-[#ffd23f] px-10 font-condensed text-xl font-black text-ink uppercase italic shadow-[4px_4px_0_#000]"
                >
                  Đặt lên kệ
                </button>
              </div>
            ) : (
              <div className="flex w-full flex-col gap-3">
                {message && (
                  <p className="border-3 border-ink bg-[#fff3a8] px-3 py-2 text-sm font-semibold text-ink" role="alert">
                    {message}
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={shake}
                    disabled={stage.phase !== "pick" || pending}
                    className="h-14 flex-1 border-3 border-white font-condensed text-lg font-black uppercase italic hover:bg-white hover:text-ink disabled:opacity-50"
                  >
                    Lắc thử
                  </button>
                  {loggedIn ? (
                    <button
                      type="button"
                      onClick={open}
                      disabled={pending || stage.phase === "opening" || !enough}
                      className="flex h-14 flex-[1.4] flex-col items-center justify-center border-3 border-ink bg-brand font-condensed text-white uppercase italic shadow-[4px_4px_0_#000] disabled:opacity-55"
                    >
                      <span className="text-xl leading-none font-black">Mở hộp</span>
                      <span className="text-xs font-bold not-italic">{enough ? `${BOX_COST} xu` : `Cần ${BOX_COST} xu, bạn có ${coins ?? 0}`}</span>
                    </button>
                  ) : (
                    <Link
                      href="/dang-nhap?next=/gacha"
                      className="flex h-14 flex-[1.4] items-center justify-center border-3 border-ink bg-brand font-condensed text-lg font-black text-white uppercase italic"
                    >
                      Đăng nhập để mở
                    </Link>
                  )}
                </div>
                <button type="button" onClick={close} disabled={pending} className="text-sm text-white/70 underline">
                  Chọn hộp khác
                </button>
              </div>
            )}
          </div>
          {stage.phase === "open" && big && result && <Celebration key={stage.slot} rarity={result.rarity as "super" | "secret"} />}
        </div>
      )}
    </div>
  );
}
