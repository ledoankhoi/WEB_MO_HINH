import { Suspense } from "react";
import type { Metadata } from "next";
import { GachaArena } from "@/components/gacha/GachaArena";
import type { CardView } from "@/components/gacha/GachaCard";
import { BOX, SectionHeading } from "@/components/store/StoreKit";
import { formatDate } from "@/lib/format";
import { RARITY_INFO, SERIES_LIST, SOURCE_LABELS, VOUCHER_DAYS } from "@/lib/gacha";
import { getCurrentUser } from "@/server/auth/session";
import { getProductsBySlugs } from "@/server/catalog";
import { getBoxShelf, getGachaState, getSeriesState } from "@/server/repo/gacha";
import "@/components/gacha/gacha.css";

export const metadata: Metadata = {
  title: "Gacha",
  description:
    "Máy quay viên nang và gói thẻ sưu tầm robot ROBOTICA: quay bằng xu, mỗi ngày 1 lượt miễn phí, xé gói lật thẻ, ghép thẻ bằng mảnh, nhận mã giảm giá. Tỷ lệ công khai.",
};

// Thẻ của mọi series kèm tên và ảnh của sản phẩm tương ứng (có cache).
async function seriesCards(): Promise<CardView[]> {
  const products = await getProductsBySlugs(SERIES_LIST.flatMap((series) => series.cards.map((card) => card.product)));
  return SERIES_LIST.flatMap((series) =>
    series.cards.map((card, index) => ({
      key: card.key,
      name: products[card.product]?.name ?? card.product,
      image: products[card.product]?.image ?? null,
      rarity: card.rarity,
      number: index + 1,
      series: series.short,
      total: series.cards.length,
    })),
  );
}

async function Gacha() {
  const [user, cards] = await Promise.all([getCurrentUser(), seriesCards()]);
  const [state, perSeries] = user
    ? await Promise.all([
        getGachaState(user.id),
        Promise.all(SERIES_LIST.map((series) => Promise.all([getSeriesState(user.id, series), getBoxShelf(user.id, series)]))),
      ])
    : [null, null];
  const names = Object.fromEntries(cards.map((card) => [card.key, card.name]));
  // Hình trên bao gói thẻ: thẻ Siêu hiếm của từng series.
  const packImages = Object.fromEntries(
    SERIES_LIST.map((series) => [series.key, cards.find((card) => card.key.startsWith(`${series.key}-`) && card.rarity === "super")?.image ?? null]),
  );

  return (
    <>
      <GachaArena
        state={
          state && perSeries
            ? {
                wallet: { balance: state.balance, shards: state.shards, freeAvailable: state.freeAvailable },
                series: Object.fromEntries(
                  SERIES_LIST.map((series, index) => {
                    const [seriesState, shelf] = perSeries[index];
                    return [series.key, { ...seriesState, boxes: shelf.slots }];
                  }),
                ),
              }
            : null
        }
        cards={cards}
        packImages={packImages}
      />

      {state && state.vouchers.length > 0 && (
        <section aria-labelledby="ma-giam-gia" className="space-y-6">
          <SectionHeading id="ma-giam-gia" bar="bg-brand">
            Mã giảm giá của bạn
          </SectionHeading>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.vouchers.map((voucher) => (
              <li key={voucher.code} className={`border-3 border-dashed bg-surface p-4 ${voucher.used || voucher.expired ? "border-line text-muted" : "border-brand"}`}>
                <p className="font-mono text-lg font-bold">{voucher.code}</p>
                <p className="text-sm">{voucher.label}</p>
                <p className="mt-1 text-xs">
                  {voucher.used ? "Đã dùng" : voucher.expired ? "Đã hết hạn" : `Hạn dùng đến ${formatDate(voucher.endsAt)}`} ·{" "}
                  {voucher.kind === "set" ? "Thưởng đủ bộ" : RARITY_INFO[voucher.kind].label}
                </p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Mã dùng một lần, hạn {VOUCHER_DAYS} ngày, nhập ở trang thanh toán.</p>
        </section>
      )}

      {state && state.recent.length > 0 && (
        <section aria-labelledby="lich-su-quay" className="space-y-4">
          <h2 id="lich-su-quay" className="font-condensed text-3xl font-black uppercase italic">
            Lịch sử
          </h2>
          <ul className={`divide-y-2 divide-line text-sm ${BOX}`}>
            {state.recent.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                <span className="w-24 shrink-0 text-muted">{formatDate(item.createdAt)}</span>
                <span className="w-24 shrink-0 font-condensed text-xs font-bold uppercase">{SOURCE_LABELS[item.source] ?? item.source}</span>
                <span className="min-w-0 flex-1">{names[item.card] ?? item.card}</span>
                <span className="font-semibold">
                  {RARITY_INFO[item.rarity].label}
                  {item.duplicate ? " · trùng" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function GachaPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-16 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang mở máy gacha...</p>}>
        <Gacha />
      </Suspense>
    </div>
  );
}
