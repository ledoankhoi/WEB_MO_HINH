import type { Rarity } from "./gacha";

// Đoạn "nạp năng lượng" trước khi mở viên nang, hộp mù hoặc lật thẻ (src/components/gacha/). Vật sắp mở rung và phát
// sáng theo từng cấp: cấp 1 xanh (Hiếm), cấp 2 đỏ (Siêu hiếm), cấp 3 cầu vồng (Bí mật). Thẻ hiếm tới đâu thì lên tới cấp
// đó rồi mới mở, nên khách chỉ biết độ hiếm khi ánh sáng ngừng đổi màu. Thẻ Thường mở ngay.

export const CHARGE_TIER: Record<Rarity, number> = { common: 0, rare: 1, super: 2, secret: 3 };

// Khoảng cách giữa hai cấp, và thời gian giữ ở cấp cuối trước khi mở (cấp càng cao giữ càng lâu).
const STEP_MS = 450;
const HOLD_MS = [0, 450, 550, 700];

// tiers[i]: mốc (ms kể từ lúc chạm) bắt đầu cấp i + 1; openAt: mốc mở.
export function chargePlan(rarity: Rarity): { tiers: number[]; openAt: number } {
  const top = CHARGE_TIER[rarity];
  const tiers = Array.from({ length: top }, (_, index) => index * STEP_MS);
  return { tiers, openAt: top === 0 ? 0 : tiers[top - 1] + HOLD_MS[top] };
}

// Chạy đoạn nạp: gọi onTier(1), onTier(2)... đúng mốc rồi gọi onOpen. `later` là hàm hẹn giờ của component (tự huỷ khi
// component bị gỡ). Việc ở mốc 0 chạy ngay để không trễ một nhịp vẽ.
export function runCharge(rarity: Rarity, later: (fn: () => void, ms: number) => void, onTier: (tier: number) => void, onOpen: () => void) {
  const plan = chargePlan(rarity);
  const at = (fn: () => void, ms: number) => (ms === 0 ? fn() : later(fn, ms));
  plan.tiers.forEach((ms, index) => at(() => onTier(index + 1), ms));
  at(onOpen, plan.openAt);
}
