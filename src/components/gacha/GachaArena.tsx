"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Ticket } from "lucide-react";
import { claimSetAction, craftAction, openAllBoxesAction, openBoxAction, pullAction } from "@/app/actions/gacha";
import { ProductImage } from "@/components/product/ProductCard";
import { BOX, SectionHeading, Sticker } from "@/components/store/StoreKit";
import { formatVnd } from "@/lib/format";
import {
  CRAFT_COST,
  DUPLICATE_SHARDS,
  PACK_COST,
  PACK_SIZE,
  PITY,
  PULL_COST,
  RARITIES,
  RARITY_INFO,
  SERIES_LIST,
  SET_VOUCHER,
  TEN_PULL_COST,
  VOUCHERS,
  guaranteedRate,
  type GachaSeries,
  type PullResult,
  type Rarity,
} from "@/lib/gacha";
import { BlindBoxShelf } from "./BlindBoxShelf";
import { CapsuleMachine } from "./CapsuleMachine";
import { RarityBurst } from "./Fx";
import { CardFace, MissingCard, type CardView } from "./GachaCard";
import { PackOpener } from "./PackOpener";
import { RevealStage } from "./RevealStage";

// Gacha (/gacha): hai cách chơi chung một bộ sưu tập. Máy quay viên nang (bố cục ba cột: bảo đảm và ví, máy, tỷ lệ và thẻ
// hiếm nhất) và mở gói thẻ (xé gói, lật thẻ). Kết quả do máy chủ quay; ở đây chỉ chạy hoạt ảnh. Trang chỉ làm mới số
// liệu sau khi hoạt ảnh xong, để bộ sưu tập không lộ thẻ mới trước khi khách mở.

export type ArenaState = {
  balance: number;
  shards: number;
  freeAvailable: boolean;
  sinceRare: number;
  owned: Record<string, number>;
  setClaimed: boolean;
  // Kệ hộp mù: mã thẻ đã mở ở từng vị trí, null là hộp còn niêm phong.
  boxes: (string | null)[];
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const percent = (value: number) => value.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const SPIN =
  "flex h-16 flex-1 flex-col items-center justify-center border-3 border-ink px-3 font-condensed uppercase italic shadow-[4px_4px_0_var(--color-ink)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0";
const TAB = "h-12 px-5 font-condensed text-lg font-black uppercase italic transition";

type Wallet = Pick<ArenaState, "balance" | "shards" | "freeAvailable">;
type SeriesView = Omit<ArenaState, keyof Wallet>;
// Ví (xu, mảnh, lượt miễn phí) dùng chung mọi series; bộ sưu tập, bảo hiểm, thưởng đủ bộ, kệ hộp mù riêng từng series.
export type ArenaData = { wallet: Wallet; series: Record<string, SeriesView> };
const WALLET_KEYS = ["balance", "shards", "freeAvailable"] as const;

export function GachaArena({
  state,
  cards: allCards,
  packImages,
}: {
  state: ArenaData | null;
  cards: CardView[];
  // Hình trên bao gói thẻ của từng series.
  packImages: Record<string, string | null>;
}) {
  const router = useRouter();
  const loggedIn = state !== null;
  const byKey = useMemo(() => Object.fromEntries(allCards.map((card) => [card.key, card])), [allCards]);
  const [selected, setSelected] = useState(SERIES_LIST[SERIES_LIST.length - 1].key);
  const currentSeries: GachaSeries = SERIES_LIST.find((series) => series.key === selected) ?? SERIES_LIST[0];
  const cards = useMemo(() => allCards.filter((card) => card.key.startsWith(`${selected}-`)), [allCards, selected]);
  const packImage = packImages[selected] ?? null;
  // Số liệu của máy chủ; sau mỗi lượt chơi ghi đè tạm bằng số máy chủ vừa trả cho tới khi trang làm mới xong. Trang được
  // giữ lại khi chuyển qua lại (Cache Components) nên phải chép số mới vào state mỗi khi prop đổi.
  const [source, setSource] = useState(state);
  const [data, setData] = useState(state);
  if (state !== source) {
    setSource(state);
    setData(state);
  }
  const view: ArenaState | null = data ? { ...data.wallet, ...data.series[selected] } : null;
  // Cập nhật ví và trạng thái của series đang chọn từ một bản vá tính trên trạng thái hiện tại.
  const apply = useCallback(
    (patch: (current: ArenaState) => Partial<ArenaState>) =>
      setData((current) => {
        if (!current) return current;
        const merged = { ...current.wallet, ...current.series[selected] };
        const next = { ...merged, ...patch(merged) };
        const isWallet = (key: string) => (WALLET_KEYS as readonly string[]).includes(key);
        const wallet = Object.fromEntries(Object.entries(next).filter(([key]) => isWallet(key))) as Wallet;
        const own = Object.fromEntries(Object.entries(next).filter(([key]) => !isWallet(key))) as SeriesView;
        return { wallet, series: { ...current.series, [selected]: own } };
      }),
    [selected],
  );
  const [mode, setMode] = useState<"may" | "goi" | "hop">("may");
  const [spinning, setSpinning] = useState(false);
  const [outlet, setOutlet] = useState<Rarity[]>([]);
  const [reveal, setReveal] = useState<PullResult[] | null>(null);
  const [message, setMessage] = useState("");
  const [crafted, setCrafted] = useState<string | null>(null);
  const [setCode, setSetCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const coins = view?.balance ?? null;
  const update = (patch: Partial<ArenaState>) => apply(() => patch);

  const spin = (pullMode: "single" | "ten" | "free") =>
    startTransition(async () => {
      setMessage("");
      setOutlet([]);
      setSpinning(true);
      // Máy rung tối thiểu một nhịp cho có cảm giác quay, kể cả khi máy chủ trả lời rất nhanh.
      const [outcome] = await Promise.all([pullAction(pullMode, selected), wait(1300)]);
      setSpinning(false);
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      update({ balance: outcome.balance, shards: outcome.shards, ...(pullMode === "free" ? { freeAvailable: false } : {}) });
      setOutlet(outcome.results.map((result) => result.rarity));
      await wait(700 + outcome.results.length * 120);
      setReveal(outcome.results);
    });

  const closeReveal = () => {
    setReveal(null);
    setOutlet([]);
    router.refresh();
  };

  const buyPack = useCallback(async () => {
    setMessage("");
    const outcome = await pullAction("pack", selected);
    if (!outcome.ok) {
      setMessage(outcome.message);
      return null;
    }
    apply(() => ({ balance: outcome.balance, shards: outcome.shards }));
    return outcome.results;
  }, [apply, selected]);
  const packOpened = useCallback(() => router.refresh(), [router]);

  const openBox = useCallback(async (slot: number) => {
    setMessage("");
    const outcome = await openBoxAction(slot, selected);
    if (outcome.ok) {
      // Mở hết kệ thì máy chủ đã xếp kệ mới (hiện khi trang làm mới); tạm thời ghi thẻ vào vị trí vừa mở.
      apply((current) => ({
        balance: outcome.balance,
        shards: outcome.shards,
        boxes: current.boxes.map((key, index) => (index === slot ? outcome.result.card : key)),
      }));
    }
    return outcome;
  }, [apply, selected]);

  const openAllBoxes = useCallback(async () => {
    setMessage("");
    const outcome = await openAllBoxesAction(selected);
    if (outcome.ok) {
      apply((current) => {
        const boxes = [...current.boxes];
        for (const result of outcome.results) boxes[result.slot] = result.card;
        return { balance: outcome.balance, shards: outcome.shards, boxes };
      });
    }
    return outcome;
  }, [apply, selected]);

  const craft = (key: string) =>
    startTransition(async () => {
      setMessage("");
      const outcome = await craftAction(key);
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      apply((current) => ({ shards: outcome.shards, owned: { ...current.owned, [key]: 1 } }));
      setCrafted(key);
      router.refresh();
    });

  const claim = () =>
    startTransition(async () => {
      setMessage("");
      const outcome = await claimSetAction(selected);
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      update({ setClaimed: true });
      setSetCode(outcome.code ?? null);
      router.refresh();
    });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const owned = view?.owned ?? {};
  const have = cards.filter((card) => (owned[card.key] ?? 0) > 0).length;
  const complete = have === cards.length;
  const secret = cards.find((card) => card.rarity === "secret");

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-4">
          <Sticker>Đang mở · {currentSeries.name}</Sticker>
          <h1 className="font-condensed text-[clamp(2.6rem,6.5vw,5rem)] leading-[0.92] font-black uppercase italic">
            {mode === "may" ? (
              <>
                Quay là có <span className="text-brand">quà robot!</span>
              </>
            ) : mode === "goi" ? (
              <>
                Xé gói, <span className="text-brand">lật thẻ!</span>
              </>
            ) : (
              <>
                Chọn hộp, <span className="text-brand">mở quà!</span>
              </>
            )}
          </h1>
        </div>
        <div role="tablist" aria-label="Cách chơi" className="flex border-3 border-ink bg-surface shadow-[4px_4px_0_var(--color-ink)]">
          <button type="button" role="tab" aria-selected={mode === "may"} onClick={() => setMode("may")} className={`${TAB} ${mode === "may" ? "bg-ink text-white" : "hover:bg-raised"}`}>
            Máy quay
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "goi"}
            onClick={() => setMode("goi")}
            className={`${TAB} border-l-3 border-ink ${mode === "goi" ? "bg-ink text-white" : "hover:bg-raised"}`}
          >
            Mở gói thẻ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "hop"}
            onClick={() => setMode("hop")}
            className={`${TAB} border-l-3 border-ink ${mode === "hop" ? "bg-ink text-white" : "hover:bg-raised"}`}
          >
            Hộp mù
          </button>
        </div>
      </div>

      <div role="radiogroup" aria-label="Chọn bộ sưu tập" className="flex flex-wrap gap-3">
        {SERIES_LIST.map((series, index) => {
          const active = series.key === selected;
          const newest = index === SERIES_LIST.length - 1;
          return (
            <button
              key={series.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setSelected(series.key);
                setMessage("");
                setCrafted(null);
                setSetCode(null);
              }}
              className={`relative flex items-center gap-3 border-3 border-ink px-4 py-2.5 text-left shadow-[4px_4px_0_var(--color-ink)] transition ${
                active ? "bg-brand text-white" : "bg-surface hover:-translate-y-0.5"
              }`}
            >
              <ProductImage
                src={allCards.find((card) => card.key.startsWith(`${series.key}-`) && card.rarity === "secret")?.image ?? null}
                alt=""
                className="size-10 border-2 border-ink bg-surface object-contain p-0.5"
              />
              <span>
                <span className="block font-condensed text-lg leading-none font-black uppercase italic">{series.short}</span>
                <span className="block text-xs font-semibold">
                  {series.theme} · {series.cards.length} thẻ
                </span>
              </span>
              {newest && SERIES_LIST.length > 1 && (
                <span className="absolute -top-3 -right-2 rotate-6 border-2 border-ink bg-[#ffd23f] px-1.5 font-condensed text-xs font-black text-ink uppercase">
                  Mới
                </span>
              )}
            </button>
          );
        })}
      </div>

      {message && (
        <p className="border-3 border-ink bg-[#fff3a8] px-4 py-3 text-sm font-semibold" role="alert">
          {message}
        </p>
      )}

      {mode === "may" ? (
        <div className="grid gap-7 lg:grid-cols-[16rem_minmax(0,1fr)_17.5rem] lg:items-start">
          <div className="order-2 space-y-6 lg:order-1">
            <PityCard sinceRare={view?.sinceRare ?? null} />
            <WalletCard state={view} />
          </div>
          <div className="order-1 space-y-7 lg:order-2">
            <CapsuleMachine series={currentSeries} spinning={spinning} outlet={outlet} coins={coins} />
            {!loggedIn ? (
              <Link
                href="/dang-nhap?next=/gacha"
                className="flex h-16 items-center justify-center border-3 border-ink bg-[#ffd23f] font-condensed text-2xl font-black uppercase italic shadow-[4px_4px_0_var(--color-ink)]"
              >
                Đăng nhập để quay
              </Link>
            ) : (
              <div className="space-y-3">
                {view?.freeAvailable && (
                  <button type="button" onClick={() => spin("free")} disabled={pending} className={`${SPIN} gx-ready w-full bg-brand text-white`}>
                    <span className="text-2xl leading-none font-black">Quay miễn phí</span>
                    <span className="text-xs font-bold not-italic">1 lượt mỗi ngày, không mất xu</span>
                  </button>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={() => spin("single")} disabled={pending || (coins ?? 0) < PULL_COST} className={`${SPIN} bg-[#ffd23f] text-ink`}>
                    <span className="text-2xl leading-none font-black">Quay 1 lượt</span>
                    <span className="text-xs font-bold not-italic">{PULL_COST} xu</span>
                  </button>
                  <button type="button" onClick={() => spin("ten")} disabled={pending || (coins ?? 0) < TEN_PULL_COST} className={`${SPIN} bg-ink text-white`}>
                    <span className="text-2xl leading-none font-black">Quay 10 lượt</span>
                    <span className="text-xs font-bold not-italic">{TEN_PULL_COST} xu · chắc 1 Hiếm</span>
                  </button>
                </div>
                {(coins ?? 0) < PULL_COST && !view?.freeAvailable && !pending && (
                  <p className="text-center text-sm">
                    Chưa đủ xu?{" "}
                    <Link href="/nhiem-vu" className="font-bold text-brand underline">
                      Làm nhiệm vụ nhận xu
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="order-3 space-y-6">
            <OddsCard series={currentSeries} />
            {secret && <FeaturedCard card={secret} owned={(owned[secret.key] ?? 0) > 0} />}
          </div>
        </div>
      ) : mode === "hop" ? (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start">
          <BlindBoxShelf
            key={selected}
            series={currentSeries}
            slots={view?.boxes ?? cards.map(() => null)}
            cards={byKey}
            coins={coins}
            loggedIn={loggedIn}
            onOpen={openBox}
            onOpenAll={openAllBoxes}
            ownedCount={cards.filter((card) => (owned[card.key] ?? 0) > 0).length}
            onDone={packOpened}
          />
          <div className="space-y-6">
            <AlbumCard cards={cards} owned={owned} />
            <ShardsCard shards={view?.shards ?? null} />
          </div>
        </div>
      ) : (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start">
          <PackOpener key={selected} series={currentSeries} cards={byKey} coins={coins} loggedIn={loggedIn} packImage={packImage} onBuy={buyPack} onOpened={packOpened} />
          <div className="space-y-6">
            <AlbumCard cards={cards} owned={owned} />
            <ShardsCard shards={view?.shards ?? null} />
            <OddsCard series={currentSeries} compact />
          </div>
        </div>
      )}

      <section aria-labelledby="bo-suu-tap" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <SectionHeading id="bo-suu-tap" bar="bg-cobalt">
            Bộ sưu tập
          </SectionHeading>
          <div className="w-full max-w-sm space-y-1.5">
            <div className="flex justify-between gap-3 font-condensed text-sm font-black uppercase">
              <span>
                {have}/{cards.length} thẻ
              </span>
              <span className="text-brand">Đủ bộ: mã giảm {formatVnd(SET_VOUCHER.value)}</span>
            </div>
            <div className="h-3.5 border-3 border-ink bg-surface">
              <div className="h-full bg-cobalt transition-[width] duration-700" style={{ width: `${(have / cards.length) * 100}%` }} />
            </div>
          </div>
        </div>

        {loggedIn && complete && !view?.setClaimed && (
          <button
            type="button"
            onClick={claim}
            disabled={pending}
            className="gx-ready h-14 border-3 border-ink bg-brand px-8 font-condensed text-xl font-black text-white uppercase italic shadow-[4px_4px_0_var(--color-ink)]"
          >
            Nhận mã giảm {formatVnd(SET_VOUCHER.value)} đủ bộ
          </button>
        )}
        {setCode && (
          <div className="flex flex-wrap items-center gap-3 border-3 border-dashed border-brand bg-surface p-4">
            <Ticket className="size-6 text-brand" aria-hidden />
            <p className="flex-1 text-sm">
              <b className="font-condensed text-xl tracking-wide">{setCode}</b>
              <br />
              {SET_VOUCHER.label}, dùng một lần, hạn 30 ngày. Nhập ở trang thanh toán.
            </p>
            <button type="button" onClick={() => copy(setCode)} className="flex items-center gap-1.5 border-3 border-ink px-3 py-1.5 font-condensed font-black uppercase">
              <Copy className="size-4" aria-hidden />
              {copied ? "Đã chép" : "Chép mã"}
            </button>
          </div>
        )}

        <ul className="grid grid-cols-2 gap-4 min-[480px]:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {cards.map((card) => {
            const count = owned[card.key] ?? 0;
            const cost = CRAFT_COST[card.rarity];
            const fresh = crafted === card.key;
            return (
              <li key={card.key} className="relative isolate aspect-[5/7]">
                {count > 0 ? (
                  <>
                    {fresh && <RarityBurst rarity={card.rarity === "common" ? "rare" : card.rarity} />}
                    <div className={`size-full ${fresh ? "gx-emerge" : ""}`}>
                      <CardFace card={card} size="sm" count={count} />
                    </div>
                  </>
                ) : (
                  <MissingCard card={card}>
                    {loggedIn && cost ? (
                      <button
                        type="button"
                        onClick={() => craft(card.key)}
                        disabled={pending || (view?.shards ?? 0) < cost}
                        className="mt-1.5 w-full border-2 border-ink bg-[#ffd23f] py-1 font-condensed text-[11px] font-black text-ink uppercase disabled:cursor-not-allowed disabled:opacity-50"
                        title={`Ghép thẻ này bằng ${cost} mảnh`}
                      >
                        Ghép · {cost} mảnh
                      </button>
                    ) : null}
                  </MissingCard>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted">
          Thẻ trùng đổi thành mảnh ghép: Thường {DUPLICATE_SHARDS.common}, Hiếm {DUPLICATE_SHARDS.rare}, Siêu hiếm {DUPLICATE_SHARDS.super}, Bí mật{" "}
          {DUPLICATE_SHARDS.secret} mảnh. Đủ mảnh thì ghép thẻ còn thiếu: Thường {CRAFT_COST.common} mảnh, Hiếm {CRAFT_COST.rare} mảnh. Thẻ Siêu hiếm và Bí
          mật chỉ có từ quay hoặc gói.
        </p>
      </section>

      {reveal && <RevealStage results={reveal} cards={byKey} onClose={closeReveal} />}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-condensed text-xl font-black uppercase italic">{children}</p>;
}

function PityCard({ sinceRare }: { sinceRare: number | null }) {
  const done = sinceRare ?? 0;
  return (
    <div className={`space-y-3 p-4 ${BOX}`}>
      <PanelTitle>Bảo đảm</PanelTitle>
      <p className="text-sm">
        Quay {PITY - 1} lượt liền chưa ra Hiếm thì lượt thứ {PITY} chắc chắn từ Hiếm trở lên.
      </p>
      {sinceRare !== null && (
        <>
          <div>
            <div className="flex justify-between font-condensed text-xs font-black uppercase">
              <span>Đã quay</span>
              <span className="tabular-nums">
                {done}/{PITY}
              </span>
            </div>
            <div className="mt-1 h-3 border-2 border-ink bg-surface">
              <div className="h-full bg-cobalt transition-[width] duration-500" style={{ width: `${(done / PITY) * 100}%` }} />
            </div>
          </div>
          <p className="font-condensed text-sm font-extrabold text-cobalt uppercase">Còn {PITY - done} lượt nữa là chắc chắn Hiếm</p>
        </>
      )}
    </div>
  );
}

function WalletCard({ state }: { state: ArenaState | null }) {
  const stat = (label: string, value: string) => (
    <div className="border-3 border-ink bg-surface px-1 py-2 text-center">
      <p className="font-condensed text-2xl leading-none font-black tabular-nums">{value}</p>
      <p className="mt-1 font-condensed text-[10px] leading-tight font-bold uppercase">{label}</p>
    </div>
  );
  return (
    <div className={`space-y-3 p-4 ${BOX}`}>
      <PanelTitle>Ví gacha</PanelTitle>
      {state ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2 flex items-baseline justify-between border-3 border-ink bg-[#ffd23f] px-3 py-2">
            <span className="font-condensed text-xs font-bold uppercase">Xu</span>
            <span className="font-condensed text-3xl leading-none font-black tabular-nums">{state.balance.toLocaleString("vi-VN")}</span>
          </div>
          {stat("Miễn phí hôm nay", state.freeAvailable ? "1" : "0")}
          {stat("Mảnh ghép", String(state.shards))}
        </div>
      ) : (
        <p className="text-sm">Đăng nhập để xem xu, lượt miễn phí và mảnh ghép.</p>
      )}
      <p className="text-xs text-muted">
        Xu kiếm từ{" "}
        <Link href="/nhiem-vu" className="font-bold text-brand underline">
          nhiệm vụ
        </Link>{" "}
        và đơn hàng hoàn tất, không nạp bằng tiền. Mỗi ngày có 1 lượt quay miễn phí.
      </p>
    </div>
  );
}

function OddsCard({ series, compact = false }: { series: GachaSeries; compact?: boolean }) {
  return (
    <div className={`space-y-3 p-4 ${BOX}`}>
      <PanelTitle>Tỷ lệ ra thẻ</PanelTitle>
      <table className="w-full text-sm">
        <thead className="sr-only">
          <tr>
            <th>Độ hiếm</th>
            <th>Tỷ lệ</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((rarity) => {
            const info = RARITY_INFO[rarity];
            const count = series.cards.filter((card) => card.rarity === rarity).length;
            return (
              <tr key={rarity} className="border-b-2 border-line last:border-b-0">
                <td className="py-1.5 pr-2">
                  <span className={`inline-block size-3.5 border-2 border-ink align-middle ${info.color}`} /> <b>{info.label}</b>{" "}
                  <span className="text-muted">· {count} thẻ</span>
                  {!compact && VOUCHERS[rarity] && <span className="block text-[11px] text-muted">{VOUCHERS[rarity]?.label}</span>}
                </td>
                <td className="py-1.5 text-right font-condensed text-lg font-black tabular-nums">{info.rate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-muted">
        Ô chắc chắn (lượt bảo hiểm, thẻ thứ 5 của gói): Hiếm {percent(guaranteedRate("rare"))}%, Siêu hiếm {percent(guaranteedRate("super"))}%, Bí mật{" "}
        {percent(guaranteedRate("secret"))}%. Máy chủ quay, trình duyệt chỉ hiển thị.
      </p>
    </div>
  );
}

function FeaturedCard({ card, owned }: { card: CardView; owned: boolean }) {
  return (
    <div className="space-y-3 border-3 border-ink bg-ink p-4 text-white shadow-[6px_6px_0_var(--color-ink)]">
      <p className="font-condensed text-sm font-black text-[#ffd23f] uppercase italic">Thẻ hiếm nhất</p>
      <div className="flex gap-3">
        <div className="relative aspect-[5/7] w-24 shrink-0">
          {owned ? (
            <CardFace card={card} size="sm" />
          ) : (
            <div className="gx-rainbow-frame size-full p-[3px]">
              <div className="gx-holo gx-holo-strong relative grid size-full place-items-center border-3 border-ink bg-ink font-condensed text-5xl font-black text-white/80">?</div>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <p className="font-condensed text-xl leading-tight font-black uppercase italic">{owned ? card.name : "???"}</p>
          <p className="text-xs text-white/80">
            1 thẻ Bí mật, tỷ lệ {RARITY_INFO.secret.rate}%. Kèm mã {VOUCHERS.secret?.label.toLowerCase()}.
          </p>
        </div>
      </div>
    </div>
  );
}

function AlbumCard({ cards, owned }: { cards: CardView[]; owned: Record<string, number> }) {
  const have = cards.filter((card) => (owned[card.key] ?? 0) > 0).length;
  return (
    <div className={`space-y-3 p-4 ${BOX}`}>
      <div className="flex items-baseline justify-between">
        <PanelTitle>Album</PanelTitle>
        <span className="font-condensed text-sm font-black text-brand uppercase">
          {have}/{cards.length} thẻ
        </span>
      </div>
      <div className="h-2.5 border-2 border-ink bg-surface">
        <div className="h-full bg-cobalt transition-[width] duration-700" style={{ width: `${(have / cards.length) * 100}%` }} />
      </div>
      <ul className="grid grid-cols-4 gap-1.5">
        {cards.map((card) => {
          const has = (owned[card.key] ?? 0) > 0;
          return (
            <li
              key={card.key}
              className={`relative aspect-[5/7] border-2 border-ink ${has ? "halftone" : card.rarity === "secret" ? "bg-ink" : "bg-raised"}`}
              title={has ? card.name : "Chưa có"}
            >
              {has ? (
                <ProductImage src={card.image} alt={card.name} className="absolute inset-0 size-full p-0.5" />
              ) : (
                <span className="grid size-full place-items-center font-condensed text-lg font-black opacity-30">?</span>
              )}
              <span className={`absolute inset-x-0 bottom-0 h-1 ${RARITY_INFO[card.rarity].color}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShardsCard({ shards }: { shards: number | null }) {
  const target = CRAFT_COST.common ?? 20;
  return (
    <div className={`space-y-3 p-4 ${BOX}`}>
      <PanelTitle>Mảnh ghép</PanelTitle>
      <div className="flex items-center gap-3">
        <span className="font-condensed text-5xl leading-none font-black text-cobalt tabular-nums">{shards ?? "—"}</span>
        <p className="text-xs">
          Đổi {CRAFT_COST.common} mảnh lấy 1 thẻ Thường còn thiếu, {CRAFT_COST.rare} mảnh lấy 1 thẻ Hiếm. Ghép ở mục Bộ sưu tập.
        </p>
      </div>
      {shards !== null && (
        <div className="h-2.5 border-2 border-ink bg-surface">
          <div className="h-full bg-[#ffd23f]" style={{ width: `${Math.min(1, shards / target) * 100}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted">Gói thẻ {PACK_COST} xu cho {PACK_SIZE} thẻ; thẻ trùng thành mảnh.</p>
    </div>
  );
}
