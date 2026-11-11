// Gacha (/gacha): thẻ sưu tầm robot, chỉ trả bằng xu (không nạp tiền; docs/ke-hoach/mo-rong-cua-hang.md). Hai cách chơi:
// máy quay viên nang (1 hoặc 10 lượt, thêm 1 lượt miễn phí mỗi ngày) và gói thẻ 5 lá (chắc chắn 1 thẻ Hiếm trở lên).
// Thẻ Hiếm trở lên kèm mã giảm giá dùng một lần; thẻ trùng thành mảnh ghép để ghép thẻ còn thiếu; đủ bộ nhận mã giảm
// giá. Tỷ lệ công khai, có bảo hiểm. Quyết định của chủ dự án ngày 08/11/2026.

export const RARITIES = ["common", "rare", "super", "secret"] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_INFO: Record<Rarity, { label: string; rate: number; color: string; stars: number }> = {
  common: { label: "Thường", rate: 70, color: "bg-surface", stars: 1 },
  rare: { label: "Hiếm", rate: 22, color: "bg-cobalt", stars: 2 },
  super: { label: "Siêu hiếm", rate: 7, color: "bg-brand", stars: 3 },
  secret: { label: "Bí mật", rate: 1, color: "bg-ink", stars: 4 },
};

// Tỷ lệ của ô chắc chắn (lượt bảo hiểm, ô thứ 5 của gói thẻ): chỉ chọn trong Hiếm trở lên theo tỷ lệ tương đối.
export function guaranteedRate(rarity: Rarity): number {
  if (rarity === "common") return 0;
  const total = RARITIES.filter((r) => r !== "common").reduce((sum, r) => sum + RARITY_INFO[r].rate, 0);
  return (RARITY_INFO[rarity].rate / total) * 100;
}

export type Voucher = { kind: "fixed" | "percent"; value: number; maxDiscount: number | null; minSubtotal: number; label: string };
// Mã giảm giá kèm thẻ theo độ hiếm (tạo vào bảng coupons, dùng một lần, hết hạn sau VOUCHER_DAYS ngày). Thẻ ghép bằng
// mảnh không kèm mã.
export const VOUCHERS: Partial<Record<Rarity, Voucher>> = {
  rare: { kind: "fixed", value: 30_000, maxDiscount: null, minSubtotal: 300_000, label: "Giảm 30.000 ₫ cho đơn từ 300.000 ₫" },
  super: { kind: "percent", value: 10, maxDiscount: 200_000, minSubtotal: 0, label: "Giảm 10% (tối đa 200.000 ₫)" },
  secret: { kind: "fixed", value: 300_000, maxDiscount: null, minSubtotal: 1_500_000, label: "Giảm 300.000 ₫ cho đơn từ 1.500.000 ₫" },
};
// Thưởng gom đủ bộ: một mã giảm giá, một lần mỗi series.
export const SET_VOUCHER: Voucher = { kind: "fixed", value: 300_000, maxDiscount: null, minSubtotal: 1_500_000, label: "Giảm 300.000 ₫ cho đơn từ 1.500.000 ₫" };
export const VOUCHER_DAYS = 30;

// Máy quay viên nang.
export const PULL_COST = 100;
export const TEN_PULL_COST = 900;
export const FREE_PULLS_PER_DAY = 1;
// Gói thẻ: 4 ô theo tỷ lệ công khai, ô cuối chắc chắn từ Hiếm trở lên.
export const PACK_SIZE = 5;
export const PACK_COST = 450;
// Quay PITY lượt liền không ra Hiếm trở lên thì lượt đó chắc chắn từ Hiếm trở lên (nên 10 lượt luôn có ít nhất 1 Hiếm).
export const PITY = 10;

// Mảnh ghép: thẻ trùng cho mảnh theo độ hiếm; đủ mảnh thì ghép một thẻ còn thiếu (chỉ Thường và Hiếm).
export const DUPLICATE_SHARDS: Record<Rarity, number> = { common: 2, rare: 5, super: 15, secret: 40 };
export const CRAFT_COST: Partial<Record<Rarity, number>> = { common: 20, rare: 50 };

// Cách chơi: máy quay 1 lượt, 10 lượt, lượt miễn phí, gói thẻ. Ghép thẻ ("craft") đi riêng.
export const PULL_MODES = {
  single: { count: 1, cost: PULL_COST, source: "machine", guaranteeLast: false },
  ten: { count: 10, cost: TEN_PULL_COST, source: "machine", guaranteeLast: false },
  free: { count: 1, cost: 0, source: "free", guaranteeLast: false },
  pack: { count: PACK_SIZE, cost: PACK_COST, source: "pack", guaranteeLast: true },
} as const;
export type PullMode = keyof typeof PULL_MODES;
export const isPullMode = (value: unknown): value is PullMode => typeof value === "string" && Object.hasOwn(PULL_MODES, value);
export type PullSource = (typeof PULL_MODES)[PullMode]["source"] | "craft" | "box";

export const SOURCE_LABELS: Record<PullSource, string> = { machine: "Máy quay", free: "Miễn phí", pack: "Gói thẻ", craft: "Ghép mảnh", box: "Hộp mù" };

// Hộp mù: mỗi khách một kệ hộp, kệ chứa đủ các thẻ của series (mỗi thẻ một hộp, thứ tự ngẫu nhiên), nên mua hết kệ là
// chắc đủ bộ. Vì vậy hộp mù không kèm mã giảm giá và không tính vào bảo hiểm; thẻ trùng vẫn thành mảnh ghép.
export const BOX_COST = 250;

export type GachaCard = { key: string; product: string; rarity: Rarity };
export type GachaSeries = { key: string; name: string; short: string; theme: string; cards: GachaCard[] };

// Mỗi series có bộ sưu tập, bảo hiểm, kệ hộp mù và thưởng đủ bộ riêng; xu, mảnh ghép, lượt miễn phí mỗi ngày dùng chung.
// Mã thẻ là duy nhất trên mọi series (tiền tố mã series). Thêm series: thêm vào SERIES_LIST, sản phẩm phải đang bán.
export const SERIES: GachaSeries = {
  key: "s1",
  name: "Series 1: Kệ ROBOTICA",
  short: "Series 1",
  theme: "Kệ ROBOTICA",
  cards: [
    { key: "s1-01", product: "jazz", rarity: "common" },
    { key: "s1-02", product: "hound", rarity: "common" },
    { key: "s1-03", product: "cliffjumper", rarity: "common" },
    { key: "s1-04", product: "wheeljack", rarity: "common" },
    { key: "s1-05", product: "swoop", rarity: "common" },
    { key: "s1-06", product: "snarl", rarity: "common" },
    { key: "s1-07", product: "sludge", rarity: "common" },
    { key: "s1-08", product: "waspinator", rarity: "common" },
    { key: "s1-09", product: "ironhide", rarity: "rare" },
    { key: "s1-10", product: "alliance-bumblebee", rarity: "rare" },
    { key: "s1-11", product: "alliance-optimus-prime", rarity: "super" },
    { key: "s1-12", product: "bruticus", rarity: "secret" },
  ],
};

// Series 2: Dinobot và robot thú Beast Wars; thẻ cao nhất là Volcanicus, 5 khủng long Dinobot hợp thể.
export const SERIES_2: GachaSeries = {
  key: "s2",
  name: "Series 2: Đội Khủng Long",
  short: "Series 2",
  theme: "Đội Khủng Long",
  cards: [
    { key: "s2-01", product: "slag", rarity: "common" },
    { key: "s2-02", product: "sludge", rarity: "common" },
    { key: "s2-03", product: "snarl", rarity: "common" },
    { key: "s2-04", product: "swoop", rarity: "common" },
    { key: "s2-05", product: "alliance-grimlock", rarity: "common" },
    { key: "s2-06", product: "waspinator", rarity: "common" },
    { key: "s2-07", product: "optimus-primal", rarity: "rare" },
    { key: "s2-08", product: "predacon-megatron", rarity: "rare" },
    { key: "s2-09", product: "grimlock", rarity: "super" },
    { key: "s2-10", product: "volcanicus", rarity: "secret" },
  ],
};

export const SERIES_LIST: GachaSeries[] = [SERIES, SERIES_2];
export const getSeries = (key: unknown): GachaSeries | undefined => SERIES_LIST.find((series) => series.key === key);
export const findCard = (key: string): GachaCard | undefined => SERIES_LIST.flatMap((series) => series.cards).find((card) => card.key === key);
// Series chứa thẻ (theo tiền tố mã thẻ).
export const seriesOfCard = (key: string): GachaSeries | undefined => SERIES_LIST.find((series) => series.cards.some((card) => card.key === key));

// Chọn độ hiếm từ số ngẫu nhiên roll trong [0, 100). `guaranteed`: ô chắc chắn, chỉ chọn trong Hiếm trở lên theo tỷ lệ
// tương đối của chúng.
export function rollRarity(roll: number, guaranteed: boolean): Rarity {
  const pool = guaranteed ? RARITIES.filter((rarity) => rarity !== "common") : RARITIES;
  const total = pool.reduce((sum, rarity) => sum + RARITY_INFO[rarity].rate, 0);
  let cursor = (roll / 100) * total;
  for (const rarity of pool) {
    cursor -= RARITY_INFO[rarity].rate;
    if (cursor < 0) return rarity;
  }
  return pool[pool.length - 1];
}

export type PullResult = {
  card: string;
  product: string;
  rarity: Rarity;
  duplicate: boolean;
  couponCode: string | null;
  voucher: string | null;
  // Mảnh ghép nhận được vì thẻ trùng.
  shards: number;
};
