// Combo giảm giá khi mua đủ bộ (docs/ke-hoach/nghiep-vu-ban-hang.md mục 12). Dùng chung cho máy chủ (tính lúc đặt hàng) và
// giỏ hàng (hiện trước số giảm và gợi ý món còn thiếu), nên hai bên ra cùng một số.
//
// Một combo gồm 2–10 sản phẩm và một phần trăm giảm. Giỏ có ít nhất một của mỗi sản phẩm thì mỗi "bộ đủ" được giảm phần
// trăm đó trên giá các món trong bộ (giá bán của phiên bản, không gồm tuỳ chọn Xưởng). Nhiều bộ thì lấy món rẻ trước. Một
// món chỉ nằm trong một combo: combo giảm nhiều phần trăm hơn được xét trước.

export type BundleDeal = { id: string; name: string; percent: number; productIds: string[] };
export type BundleLine = { productId: string; unitPrice: number; quantity: number };
export type AppliedBundle = { dealId: string; name: string; percent: number; sets: number; amount: number };
// Combo đã có một phần trong giỏ: các sản phẩm còn thiếu để được giảm.
export type MissingBundle = { dealId: string; name: string; percent: number; missing: string[] };

export const BUNDLE_MIN_PRODUCTS = 2;
export const BUNDLE_MAX_PRODUCTS = 10;
export const BUNDLE_MAX_PERCENT = 50;

export function applyBundles(lines: readonly BundleLine[], deals: readonly BundleDeal[]): { discount: number; applied: AppliedBundle[]; missing: MissingBundle[] } {
  // Mỗi sản phẩm: danh sách đơn giá từng món, rẻ trước.
  const pool = new Map<string, number[]>();
  for (const line of lines) {
    const prices = pool.get(line.productId) ?? [];
    for (let i = 0; i < line.quantity; i++) prices.push(line.unitPrice);
    pool.set(line.productId, prices);
  }
  for (const prices of pool.values()) prices.sort((a, b) => a - b);

  const applied: AppliedBundle[] = [];
  const missing: MissingBundle[] = [];
  const ordered = [...deals].filter((deal) => deal.productIds.length >= BUNDLE_MIN_PRODUCTS).sort((a, b) => b.percent - a.percent || a.id.localeCompare(b.id));
  for (const deal of ordered) {
    const sets = Math.min(...deal.productIds.map((id) => pool.get(id)?.length ?? 0));
    if (sets > 0) {
      let sum = 0;
      for (const id of deal.productIds) sum += pool.get(id)!.splice(0, sets).reduce((a, b) => a + b, 0);
      applied.push({ dealId: deal.id, name: deal.name, percent: deal.percent, sets, amount: Math.floor((sum * deal.percent) / 100) });
    } else {
      const have = deal.productIds.filter((id) => (pool.get(id)?.length ?? 0) > 0);
      if (have.length > 0) missing.push({ dealId: deal.id, name: deal.name, percent: deal.percent, missing: deal.productIds.filter((id) => !have.includes(id)) });
    }
  }
  return { discount: applied.reduce((sum, item) => sum + item.amount, 0), applied, missing };
}
