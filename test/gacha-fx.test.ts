import { describe, expect, it } from "vitest";
import { RARITIES } from "@/lib/gacha";
import { chargePlan, runCharge } from "@/lib/gacha-fx";

// Đoạn "nạp năng lượng" trước khi mở viên nang, hộp mù, lật thẻ: thẻ càng hiếm càng lên nhiều cấp sáng và chờ lâu hơn.
describe("nạp năng lượng theo độ hiếm", () => {
  it("thẻ Thường mở ngay, không có cấp sáng", () => {
    expect(chargePlan("common")).toEqual({ tiers: [], openAt: 0 });
  });

  it("mỗi bậc hiếm thêm một cấp sáng, cấp đầu bắt đầu ngay khi chạm", () => {
    expect(RARITIES.map((rarity) => chargePlan(rarity).tiers.length)).toEqual([0, 1, 2, 3]);
    for (const rarity of RARITIES.slice(1)) expect(chargePlan(rarity).tiers[0]).toBe(0);
  });

  it("các cấp tăng dần và thẻ mở sau cấp cuối; thẻ hiếm hơn chờ lâu hơn nhưng không quá 2 giây", () => {
    let previous = -1;
    for (const rarity of RARITIES) {
      const plan = chargePlan(rarity);
      for (let i = 1; i < plan.tiers.length; i++) expect(plan.tiers[i]).toBeGreaterThan(plan.tiers[i - 1]);
      if (plan.tiers.length > 0) expect(plan.openAt).toBeGreaterThan(plan.tiers[plan.tiers.length - 1]);
      expect(plan.openAt).toBeGreaterThan(previous);
      expect(plan.openAt).toBeLessThanOrEqual(2000);
      previous = plan.openAt;
    }
  });

  it("runCharge báo từng cấp theo thứ tự rồi mới mở", () => {
    const queue: { at: number; fn: () => void }[] = [];
    const log: string[] = [];
    runCharge(
      "secret",
      (fn, ms) => queue.push({ at: ms, fn }),
      (tier) => log.push(`cấp ${tier}`),
      () => log.push("mở"),
    );
    // Cấp 1 chạy ngay, không qua hẹn giờ.
    expect(log).toEqual(["cấp 1"]);
    queue.sort((a, b) => a.at - b.at).forEach((item) => item.fn());
    expect(log).toEqual(["cấp 1", "cấp 2", "cấp 3", "mở"]);
  });

  it("runCharge với thẻ Thường mở ngay, không hẹn giờ", () => {
    const queue: unknown[] = [];
    const log: string[] = [];
    runCharge("common", (fn) => queue.push(fn), (tier) => log.push(`cấp ${tier}`), () => log.push("mở"));
    expect(log).toEqual(["mở"]);
    expect(queue).toEqual([]);
  });
});
