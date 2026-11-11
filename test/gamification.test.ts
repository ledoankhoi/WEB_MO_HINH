import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { newId, newToken } = await import("@/server/ids");
const users = await import("@/server/repo/users");
const coins = await import("@/server/repo/coins");
const quests = await import("@/server/repo/quests");
const gacha = await import("@/server/repo/gacha");
const { evaluateCoupon } = await import("@/server/repo/coupons");
const { rollRarity, PITY, SERIES, TEN_PULL_COST, PACK_COST, PACK_SIZE, DUPLICATE_SHARDS, CRAFT_COST, BOX_COST, SERIES_2, guaranteedRate } = await import("@/lib/gacha");
const { COMIC_CHAPTERS } = await import("@/data/comics");
const { CHECKIN_REWARD, STREAK_BONUS } = await import("@/lib/quests");

const customer = (email: string) => users.insertUser({ email, name: "Khách", phone: "", passwordHash: "x" });

beforeAll(async () => {
  await getDb();
});
afterAll(cleanup);

describe("xu và nhiệm vụ", () => {
  it("điểm danh mỗi ngày một lần; đủ 7 ngày liền thưởng thêm", async () => {
    const userId = await customer("diem-danh@example.com");
    expect(await quests.checkIn(userId)).toMatchObject({ amount: CHECKIN_REWARD, streak: 1 });
    expect((await quests.checkIn(userId)).amount).toBe(0);
    expect(await coins.getBalance(userId)).toBe(CHECKIN_REWARD);

    // Một khách khác đã điểm danh 6 ngày trước đó: hôm nay là ngày thứ 7.
    const loyal = await customer("chuoi-7@example.com");
    const db = await getDb();
    const today = String((await db.execute(`SELECT ${coins.TODAY_VN_SQL} AS d`)).rows[0].d);
    for (let back = 1; back <= 6; back++) {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - back * 86_400_000).toISOString().slice(0, 10);
      await coins.credit(loyal, CHECKIN_REWARD, "checkin", day);
    }
    expect(await quests.checkIn(loyal)).toMatchObject({ amount: CHECKIN_REWARD + STREAK_BONUS, streak: 7 });
  });

  it("nhiệm vụ: chưa đạt thì không nhận được; đạt thì nhận đúng một lần", async () => {
    const db = await getDb();
    const userId = await customer("nhiem-vu@example.com");
    expect(await quests.claimReward(userId, "quest", "yeu-thich")).toEqual({ ok: false, reason: "not_ready" });
    const products = await db.execute("SELECT id FROM products WHERE status = 'published' LIMIT 3");
    for (const row of products.rows) {
      await db.execute({ sql: "INSERT INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)", args: [userId, String(row.id), Date.now()] });
    }
    expect(await quests.claimReward(userId, "quest", "yeu-thich")).toEqual({ ok: true, amount: 15 });
    expect(await quests.claimReward(userId, "quest", "yeu-thich")).toEqual({ ok: false, reason: "claimed" });
    expect(await quests.claimReward(userId, "quest", "khong-co")).toEqual({ ok: false, reason: "not_found" });
  });

  it("đọc truyện: chương có thật mới ghi; đọc xong nhận xu chương đó", async () => {
    const userId = await customer("doc-truyen@example.com");
    const chapter = COMIC_CHAPTERS[0].slug;
    expect(await quests.markComicRead(userId, "chuong-khong-co")).toBe(false);
    expect(await quests.claimReward(userId, "comic", chapter)).toEqual({ ok: false, reason: "not_ready" });
    expect(await quests.markComicRead(userId, chapter)).toBe(true);
    expect((await quests.claimReward(userId, "comic", chapter)).ok).toBe(true);
  });

  it("đơn hoàn tất nhận 1 xu mỗi 10.000 ₫, một lần mỗi đơn; đơn chưa hoàn tất không có", async () => {
    const db = await getDb();
    const userId = await customer("mua-hang@example.com");
    const order = async (status: string, total: number) => {
      const id = newId();
      await db.execute({
        sql: `INSERT INTO orders (id, code, token, user_id, status, payment_method, customer_name, customer_phone, shipping_address, shipping_city,
                subtotal, shipping_fee, total, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, 'cod', 'Khách', '0912345678', '1 Lê Lợi', 'Hà Nội', ?, 0, ?, ?, ?)`,
        args: [id, `RB-${id.slice(0, 8)}`, newToken(), userId, status, total, total, Date.now(), Date.now()],
      });
      return id;
    };
    const done = await order("completed", 1_295_000);
    await order("processing", 500_000);
    const board = await quests.getQuestBoard(userId);
    expect(board.orderRewards).toEqual([expect.objectContaining({ orderId: done, reward: 129 })]);
    expect(await quests.claimReward(userId, "order", done)).toEqual({ ok: true, amount: 129 });
    expect((await quests.claimReward(userId, "order", done)).ok).toBe(false);
  });
});

describe("gacha", () => {
  it("tỷ lệ: biên của từng độ hiếm; ô chắc chắn không bao giờ ra Thường; tỷ lệ ô chắc chắn cộng đủ 100%", () => {
    expect(rollRarity(0, false)).toBe("common");
    expect(rollRarity(69.99, false)).toBe("common");
    expect(rollRarity(70, false)).toBe("rare");
    expect(rollRarity(92, false)).toBe("super");
    expect(rollRarity(99, false)).toBe("secret");
    for (const roll of [0, 50, 99.99]) expect(rollRarity(roll, true)).not.toBe("common");
    expect(guaranteedRate("common")).toBe(0);
    expect(guaranteedRate("rare") + guaranteedRate("super") + guaranteedRate("secret")).toBeCloseTo(100);
  });

  it("không đủ xu thì không quay, không ghi gì", async () => {
    const userId = await customer("ngheo-xu@example.com");
    await coins.credit(userId, 50, "quest", "tang");
    expect(await gacha.pull(userId, "single")).toEqual({ ok: false, reason: "not_enough_coins" });
    expect(await gacha.pull(userId, "pack")).toEqual({ ok: false, reason: "not_enough_coins" });
    const db = await getDb();
    expect((await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM gacha_pulls WHERE user_id = ?", args: [userId] })).rows[0].n).toBe(0);
    expect(await coins.getBalance(userId)).toBe(50);
    expect(await gacha.getShardBalance(userId)).toBe(0);
  });

  it("10 lượt: trừ xu, thẻ trùng thành mảnh, lượt thứ 10 bảo hiểm ra Hiếm kèm mã giảm giá dùng được", async () => {
    const userId = await customer("quay-gacha@example.com");
    await coins.credit(userId, 1000, "quest", "tang");
    // random luôn trả 0: độ hiếm Thường và thẻ đầu tiên của nhóm, trừ lượt bảo hiểm.
    const outcome = await gacha.pull(userId, "ten", () => 0);
    if (!outcome.ok) throw new Error("phải quay được");
    expect(outcome.results).toHaveLength(10);
    expect(outcome.results.slice(0, PITY - 1).every((r) => r.rarity === "common")).toBe(true);
    const last = outcome.results[PITY - 1];
    expect(last.rarity).toBe("rare");
    expect(last.couponCode).toMatch(/^GACHA-[A-Z2-9]{8}$/);
    // 8 lượt Thường sau lượt đầu đều trùng thẻ đầu tiên: mỗi lượt thêm mảnh, xu không đổi thêm.
    expect(outcome.balance).toBe(1000 - TEN_PULL_COST);
    expect(outcome.shards).toBe(8 * DUPLICATE_SHARDS.common);
    expect(outcome.results.filter((r) => r.duplicate).map((r) => r.shards)).toEqual(Array(8).fill(DUPLICATE_SHARDS.common));

    const evaluation = await evaluateCoupon(last.couponCode!, [{ variantId: "x", price: 400_000, quantity: 1 }]);
    expect(evaluation).toMatchObject({ ok: true, discount: 30_000 });
    const state = await gacha.getGachaState(userId);
    expect(state.sinceRare).toBe(0);
    expect(state.shards).toBe(8 * DUPLICATE_SHARDS.common);
    expect(state.vouchers).toHaveLength(1);
    expect(state.recent[0]).toMatchObject({ source: "machine" });
    expect(await gacha.claimSetReward(userId)).toEqual({ status: "incomplete" });
    expect(Object.keys(state.owned).length).toBeLessThan(SERIES.cards.length);
    const board = await quests.getQuestBoard(userId);
    expect(board.quests.find((q) => q.ref === "gacha")?.status).toBe("claimable");
  });

  it("lượt miễn phí: mỗi ngày một lượt, không mất xu, kể cả khi bấm hai lần cùng lúc", async () => {
    const userId = await customer("mien-phi@example.com");
    expect((await gacha.getGachaState(userId)).freeAvailable).toBe(true);
    const both = await Promise.all([gacha.pull(userId, "free"), gacha.pull(userId, "free")]);
    expect(both.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(both.find((outcome) => !outcome.ok)).toEqual({ ok: false, reason: "free_used" });
    expect(await gacha.pull(userId, "free")).toEqual({ ok: false, reason: "free_used" });
    const state = await gacha.getGachaState(userId);
    expect(state.freeAvailable).toBe(false);
    expect(state.balance).toBe(0);
    expect(state.recent).toEqual([expect.objectContaining({ source: "free" })]);
  });

  it("gói thẻ: 450 xu cho 5 thẻ, thẻ thứ 5 luôn từ Hiếm trở lên", async () => {
    const userId = await customer("goi-the@example.com");
    await coins.credit(userId, 1000, "quest", "tang");
    const outcome = await gacha.pull(userId, "pack", () => 0);
    if (!outcome.ok) throw new Error("phải mở được gói");
    expect(outcome.results).toHaveLength(PACK_SIZE);
    expect(outcome.results.slice(0, PACK_SIZE - 1).every((r) => r.rarity === "common")).toBe(true);
    expect(outcome.results[PACK_SIZE - 1].rarity).not.toBe("common");
    expect(outcome.balance).toBe(1000 - PACK_COST);
    const db = await getDb();
    const sources = await db.execute({ sql: "SELECT DISTINCT source FROM gacha_pulls WHERE user_id = ?", args: [userId] });
    expect(sources.rows.map((row) => row.source)).toEqual(["pack"]);
  });

  it("ghép thẻ: đủ mảnh thì ghép thẻ còn thiếu; không ghép thẻ đã có hay thẻ Siêu hiếm; thẻ ghép không tính bảo hiểm", async () => {
    const db = await getDb();
    const userId = await customer("ghep-the@example.com");
    const missing = SERIES.cards.find((card) => card.rarity === "common")!;
    expect(await gacha.craft(userId, missing.key)).toEqual({ ok: false, reason: "not_enough_shards" });
    await db.execute({
      sql: "INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [newId(), userId, 60, "duplicate", "tang", Date.now()],
    });
    const crafted = await gacha.craft(userId, missing.key);
    expect(crafted).toMatchObject({ ok: true, shards: 60 - CRAFT_COST.common!, result: { card: missing.key, couponCode: null } });
    expect(await gacha.craft(userId, missing.key)).toEqual({ ok: false, reason: "owned" });
    expect(await gacha.craft(userId, SERIES.cards.find((card) => card.rarity === "super")!.key)).toEqual({ ok: false, reason: "invalid" });
    expect(await gacha.craft(userId, "khong-co")).toEqual({ ok: false, reason: "invalid" });
    const rare = SERIES.cards.find((card) => card.rarity === "rare")!;
    expect(await gacha.craft(userId, rare.key)).toEqual({ ok: false, reason: "not_enough_shards" });
    const state = await gacha.getGachaState(userId);
    expect(state.owned[missing.key]).toBe(1);
    expect(state.sinceRare).toBe(0);
    expect(state.recent[0]).toMatchObject({ source: "craft" });
  });

  it("đủ bộ: nhận mã giảm 300.000 ₫ một lần; ai đã nhận 500 xu theo luật cũ thì không nhận thêm", async () => {
    const db = await getDb();
    const collect = async (userId: string) => {
      for (const card of SERIES.cards) {
        await db.execute({
          sql: "INSERT INTO gacha_pulls (id, user_id, series, card, rarity, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [newId(), userId, SERIES.key, card.key, card.rarity, "machine", Date.now()],
        });
      }
    };
    const userId = await customer("du-bo@example.com");
    await collect(userId);
    const claimed = await gacha.claimSetReward(userId);
    if (claimed.status !== "ok") throw new Error("phải nhận được thưởng");
    expect(await evaluateCoupon(claimed.code, [{ variantId: "x", price: 1_600_000, quantity: 1 }])).toMatchObject({ ok: true, discount: 300_000 });
    expect(await gacha.claimSetReward(userId)).toEqual({ status: "claimed" });
    const state = await gacha.getGachaState(userId);
    expect(state.setClaimed).toBe(true);
    expect(state.vouchers).toEqual([expect.objectContaining({ code: claimed.code, kind: "set" })]);

    const legacy = await customer("du-bo-cu@example.com");
    await collect(legacy);
    await coins.credit(legacy, 500, "gacha-set", SERIES.key);
    expect((await gacha.getGachaState(legacy)).setClaimed).toBe(true);
    expect(await gacha.claimSetReward(legacy)).toEqual({ status: "claimed" });
  });
it("hộp mù: kệ 12 hộp chứa đủ 12 thẻ khác nhau; không mở một hộp hai lần; thiếu xu không ghi gì; mở hết thì có kệ mới", async () => {
    const userId = await customer("hop-mu@example.com");
    const total = SERIES.cards.length;
    expect(await gacha.openBox(userId, 0)).toEqual({ ok: false, reason: "not_enough_coins" });
    expect((await gacha.getBoxShelf(userId)).slots.every((slot) => slot === null)).toBe(true);
    await coins.credit(userId, BOX_COST * total + 50, "quest", "tang");
    expect(await gacha.openBox(userId, total)).toEqual({ ok: false, reason: "invalid" });
    expect(await gacha.openBox(userId, 1.5)).toEqual({ ok: false, reason: "invalid" });

    // Bấm cùng một hộp hai lần cùng lúc: chỉ mở và trừ xu một lần.
    const twice = await Promise.all([gacha.openBox(userId, 3), gacha.openBox(userId, 3)]);
    expect(twice.filter((outcome) => outcome.ok)).toHaveLength(1);
    expect(twice.find((outcome) => !outcome.ok)).toEqual({ ok: false, reason: "opened" });
    expect(await coins.getBalance(userId)).toBe(BOX_COST * (total - 1) + 50);

    const results = [];
    for (let slot = 0; slot < total; slot++) {
      if (slot === 3) continue;
      const outcome = await gacha.openBox(userId, slot);
      if (!outcome.ok) throw new Error(`phải mở được hộp ${slot}`);
      expect(outcome.result.couponCode).toBeNull();
      results.push(outcome);
    }
    const shelfCards = [twice.find((outcome) => outcome.ok)!, ...results].map((outcome) => (outcome.ok ? outcome.result.card : ""));
    expect(new Set(shelfCards).size).toBe(total);
    expect(results.at(-1)).toMatchObject({ finished: true });
    expect(results.slice(0, -1).every((outcome) => outcome.ok && !outcome.finished)).toBe(true);
    expect(await coins.getBalance(userId)).toBe(50);

    const state = await gacha.getGachaState(userId);
    expect(Object.keys(state.owned)).toHaveLength(total);
    // Lượt hộp mù không tính vào bảo hiểm của máy quay.
    expect(state.sinceRare).toBe(0);
    // Kệ cũ mở hết: kệ hiện tại là kệ mới, còn nguyên.
    expect((await gacha.getBoxShelf(userId)).slots.every((slot) => slot === null)).toBe(true);
    await coins.credit(userId, BOX_COST, "quest", "tang-2");
    const again = await gacha.openBox(userId, 0);
    expect(again).toMatchObject({ ok: true, result: { duplicate: true } });
    if (again.ok) expect(again.result.shards).toBe(DUPLICATE_SHARDS[again.result.rarity]);
  });
it("mua cả kệ: mở một lúc mọi hộp còn niêm phong, giá theo số hộp còn lại; thiếu xu thì không ghi gì", async () => {
    const userId = await customer("ca-ke@example.com");
    const total = SERIES.cards.length;
    await coins.credit(userId, BOX_COST * 2, "quest", "tang");
    const first = await gacha.openBox(userId, 0);
    const second = await gacha.openBox(userId, 5);
    if (!first.ok || !second.ok) throw new Error("phải mở được 2 hộp");
    // Còn 10 hộp, chưa có xu: không trừ, không mở gì.
    expect(await gacha.openAllBoxes(userId)).toEqual({ ok: false, reason: "not_enough_coins" });
    expect((await gacha.getBoxShelf(userId)).slots.filter(Boolean)).toHaveLength(2);

    await coins.credit(userId, BOX_COST * (total - 2), "quest", "tang-2");
    const all = await gacha.openAllBoxes(userId);
    if (!all.ok) throw new Error("phải mua được cả kệ");
    expect(all.results.map((result) => result.slot)).toEqual([...Array(total).keys()].filter((slot) => slot !== 0 && slot !== 5));
    expect(all.finished).toBe(true);
    expect(all.balance).toBe(0);
    const cardsOnShelf = new Set([first.result.card, second.result.card, ...all.results.map((result) => result.card)]);
    expect(cardsOnShelf.size).toBe(total);
    expect(Object.keys((await gacha.getGachaState(userId)).owned)).toHaveLength(total);
    // Kệ mới còn nguyên.
    expect((await gacha.getBoxShelf(userId)).slots.every((slot) => slot === null)).toBe(true);
  });
it("series 2 (Đội Khủng Long): thẻ cao nhất là Volcanicus; bộ sưu tập, bảo hiểm, kệ hộp mù tách riêng từng series", async () => {
    expect(SERIES_2.cards.find((card) => card.rarity === "secret")?.product).toBe("volcanicus");
    const keys = [...SERIES.cards, ...SERIES_2.cards].map((card) => card.key);
    expect(new Set(keys).size).toBe(keys.length);

    const userId = await customer("series-2@example.com");
    await coins.credit(userId, 5000, "quest", "tang");
    const outcome = await gacha.pull(userId, "ten", () => 0, SERIES_2);
    if (!outcome.ok) throw new Error("phải quay được");
    expect(outcome.results.every((result) => result.card.startsWith("s2-"))).toBe(true);
    const s1 = await gacha.getSeriesState(userId, SERIES);
    const s2 = await gacha.getSeriesState(userId, SERIES_2);
    expect(s1.owned).toEqual({});
    expect(Object.keys(s2.owned).every((key) => key.startsWith("s2-"))).toBe(true);
    // Lượt 10 ra Hiếm (bảo hiểm) chỉ đặt lại bảo hiểm của series 2.
    expect(s2.sinceRare).toBe(0);

    // Mỗi series một kệ: mở hộp ở cả hai series cùng lúc được; kệ series 2 có 10 hộp.
    const [box1, box2] = await Promise.all([gacha.openBox(userId, 0, undefined, SERIES), gacha.openBox(userId, 0, undefined, SERIES_2)]);
    expect(box1).toMatchObject({ ok: true });
    expect(box2).toMatchObject({ ok: true });
    if (box1.ok && box2.ok) {
      expect(box1.result.card.startsWith("s1-")).toBe(true);
      expect(box2.result.card.startsWith("s2-")).toBe(true);
    }
    expect((await gacha.getBoxShelf(userId, SERIES_2)).slots).toHaveLength(SERIES_2.cards.length);
    const all = await gacha.openAllBoxes(userId, undefined, SERIES_2);
    if (!all.ok) throw new Error("phải mua được cả kệ series 2");
    expect(all.finished).toBe(true);
    expect(all.results.some((result) => result.card === "s2-10") || (box2.ok && box2.result.card === "s2-10")).toBe(true);
    expect(await gacha.claimSetReward(userId, SERIES_2)).toMatchObject({ status: "ok" });
    expect(await gacha.claimSetReward(userId, SERIES)).toEqual({ status: "incomplete" });

    // Ghép thẻ tự nhận series theo mã thẻ.
    const db = await getDb();
    await db.execute({
      sql: "INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [newId(), userId, 100, "duplicate", "tang-s", Date.now()],
    });
    const ownedS1 = (await gacha.getSeriesState(userId, SERIES)).owned;
    const missingS1 = SERIES.cards.find((card) => card.rarity === "common" && !(card.key in ownedS1));
    if (missingS1) expect(await gacha.craft(userId, missingS1.key)).toMatchObject({ ok: true });
  });
});
