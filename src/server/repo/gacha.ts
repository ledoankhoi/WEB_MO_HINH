import "server-only";
import { randomInt } from "node:crypto";
import {
  BOX_COST,
  CRAFT_COST,
  DUPLICATE_SHARDS,
  FREE_PULLS_PER_DAY,
  PITY,
  PULL_MODES,
  SERIES,
  SET_VOUCHER,
  VOUCHERS,
  VOUCHER_DAYS,
  findCard,
  rollRarity,
  seriesOfCard,
  type GachaSeries,
  type PullMode,
  type PullResult,
  type PullSource,
  type Rarity,
  type Voucher,
} from "@/lib/gacha";
import { getDb, type InStatement, type InValue } from "../db";
import { newId } from "../ids";
import { TODAY_VN_SQL, getBalance, userLock } from "./coins";

// Gacha: lượt quay (máy, miễn phí, gói thẻ, ghép mảnh), mã giảm giá trúng thưởng, mảnh ghép, bộ sưu tập (bảng
// gacha_pulls, gacha_shards, gacha_rewards, coin_ledger, coupons).

export type GachaVoucher = { code: string; label: string; kind: Rarity | "set"; used: boolean; expired: boolean; endsAt: number };

export type GachaState = {
  balance: number;
  shards: number;
  freeAvailable: boolean;
  // Số lượt liền gần nhất chưa ra Hiếm trở lên (lượt thứ PITY chắc chắn ra). Thẻ ghép bằng mảnh không tính.
  sinceRare: number;
  owned: Record<string, number>;
  setClaimed: boolean;
  vouchers: GachaVoucher[];
  recent: { id: string; card: string; rarity: Rarity; duplicate: boolean; source: PullSource; createdAt: number }[];
};

async function readPullState(userId: string, series: GachaSeries = SERIES) {
  const db = await getDb();
  const [owned, history] = await db.batch([
    { sql: "SELECT card, COUNT(*)::int AS n FROM gacha_pulls WHERE user_id = ? AND series = ? GROUP BY card", args: [userId, series.key] },
    {
      sql: "SELECT rarity FROM gacha_pulls WHERE user_id = ? AND series = ? AND source NOT IN ('craft', 'box') ORDER BY created_at DESC, id DESC LIMIT ?",
      args: [userId, series.key, PITY],
    },
  ]);
  let sinceRare = 0;
  for (const row of history.rows) {
    if (row.rarity !== "common") break;
    sinceRare += 1;
  }
  return { owned: Object.fromEntries(owned.rows.map((row) => [String(row.card), Number(row.n)])) as Record<string, number>, sinceRare };
}

export async function getShardBalance(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT COALESCE(SUM(amount), 0)::int AS n FROM gacha_shards WHERE user_id = ?", args: [userId] });
  return Number(result.rows[0].n);
}

export type SeriesState = { sinceRare: number; owned: Record<string, number>; setClaimed: boolean };

// Bộ sưu tập, bảo hiểm và thưởng đủ bộ của một series.
export async function getSeriesState(userId: string, series: GachaSeries = SERIES): Promise<SeriesState> {
  const db = await getDb();
  const [{ owned, sinceRare }, claimed] = await Promise.all([
    readPullState(userId, series),
    db.execute({
      // Ai đã nhận 500 xu đủ bộ theo luật cũ (coin_ledger 'gacha-set') coi như đã nhận.
      sql: `SELECT EXISTS (SELECT 1 FROM gacha_rewards WHERE user_id = ? AND series = ?)
              OR EXISTS (SELECT 1 FROM coin_ledger WHERE user_id = ? AND reason = 'gacha-set' AND ref = ?) AS claimed`,
      args: [userId, series.key, userId, series.key],
    }),
  ]);
  return { sinceRare, owned, setClaimed: claimed.rows[0].claimed === true };
}

export async function getGachaState(userId: string, series: GachaSeries = SERIES): Promise<GachaState> {
  const db = await getDb();
  const [{ owned, sinceRare, setClaimed }, balance, [shards, free, vouchers, recent]] = await Promise.all([
    getSeriesState(userId, series),
    getBalance(userId),
    db.batch([
      { sql: "SELECT COALESCE(SUM(amount), 0)::int AS n FROM gacha_shards WHERE user_id = ?", args: [userId] },
      { sql: `SELECT COUNT(*)::int AS n FROM gacha_pulls WHERE user_id = ? AND free_day = ${TODAY_VN_SQL}`, args: [userId] },
      {
        sql: `SELECT x.code, x.kind, c.used_count >= COALESCE(c.usage_limit, 1) AS used,
                c.ends_at <= extract(epoch from now()) * 1000 AS expired, c.ends_at
              FROM (SELECT coupon_code AS code, rarity AS kind, created_at FROM gacha_pulls WHERE user_id = ? AND coupon_code IS NOT NULL
                    UNION ALL
                    SELECT coupon_code, 'set', created_at FROM gacha_rewards WHERE user_id = ? AND coupon_code IS NOT NULL) x
              JOIN coupons c ON c.code = x.code ORDER BY x.created_at DESC LIMIT 30`,
        args: [userId, userId],
      },
      {
        sql: "SELECT id, card, rarity, duplicate, source, created_at FROM gacha_pulls WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20",
        args: [userId],
      },
    ]),
  ]);
  return {
    balance,
    shards: Number(shards.rows[0].n),
    freeAvailable: Number(free.rows[0].n) < FREE_PULLS_PER_DAY,
    sinceRare,
    owned,
    setClaimed,
    vouchers: vouchers.rows.map((row) => {
      const kind = String(row.kind) as Rarity | "set";
      return {
        code: String(row.code),
        label: kind === "set" ? SET_VOUCHER.label : (VOUCHERS[kind]?.label ?? ""),
        kind,
        used: Boolean(row.used),
        expired: Boolean(row.expired),
        endsAt: Number(row.ends_at),
      };
    }),
    recent: recent.rows.map((row) => ({
      id: String(row.id),
      card: String(row.card),
      rarity: String(row.rarity) as Rarity,
      duplicate: row.duplicate === true,
      source: String(row.source) as PullSource,
      createdAt: Number(row.created_at),
    })),
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const voucherCode = () => `GACHA-${Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

type Guard = { sql: string; args: InValue[] };

function couponStatement(code: string, voucher: Voucher, now: number, guard: Guard): InStatement {
  return {
    sql: `INSERT INTO coupons (id, code, kind, value, max_discount, min_subtotal, starts_at, ends_at, usage_limit, is_active, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, NULL, ?, 1, true, ?, ? WHERE ${guard.sql}`,
    args: [newId(), code, voucher.kind, voucher.value, voucher.maxDiscount, voucher.minSubtotal, now + VOUCHER_DAYS * 86_400_000, now, now, ...guard.args],
  };
}

export type PullOutcome = { ok: true; results: PullResult[]; balance: number; shards: number } | { ok: false; reason: "not_enough_coins" | "free_used" };

// Một lần chơi: máy quay 1 hoặc 10 lượt, lượt miễn phí trong ngày, hoặc một gói thẻ (ô cuối chắc chắn Hiếm trở lên).
// `random(n)` trả số nguyên ngẫu nhiên trong [0, n) (mặc định crypto.randomInt; test truyền hàm cố định).
// Mọi câu ghi cùng một giao dịch và phụ thuộc "vé" ở câu thứ hai: dòng trừ xu (đủ xu mới chèn được) hoặc, với lượt miễn
// phí, chính dòng lượt quay (chỉ mục duy nhất theo ngày: hôm nay đã quay thì không chèn được). Không có vé thì không ghi gì.
export async function pull(userId: string, mode: PullMode, random: (n: number) => number = randomInt, series: GachaSeries = SERIES): Promise<PullOutcome> {
  const { count, cost, source, guaranteeLast } = PULL_MODES[mode];
  const { owned, sinceRare } = await readPullState(userId, series);
  const counts = { ...owned };
  let streak = sinceRare;
  const now = Date.now();
  const pullIds = Array.from({ length: count }, () => newId());
  const statements: InStatement[] = [userLock(userId)];
  let guard: Guard;
  if (cost > 0) {
    const spendId = newId();
    const note = mode === "pack" ? `Gói thẻ ${series.name}` : `${count} lượt ${series.name}`;
    statements.push({
      sql: `INSERT INTO coin_ledger (id, user_id, amount, reason, ref, note, created_at)
            SELECT ?, ?, ?, 'gacha', ?, ?, ? WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE user_id = ?) >= ?`,
      args: [spendId, userId, -cost, spendId, note, now, userId, cost],
    });
    guard = { sql: "EXISTS (SELECT 1 FROM coin_ledger WHERE id = ?)", args: [spendId] };
  } else {
    guard = { sql: "EXISTS (SELECT 1 FROM gacha_pulls WHERE id = ?)", args: [pullIds[0]] };
  }

  const results: PullResult[] = [];
  for (let index = 0; index < count; index++) {
    const guaranteed = (guaranteeLast && index === count - 1) || streak + 1 >= PITY;
    const rarity = rollRarity(random(10_000) / 100, guaranteed);
    const pool = series.cards.filter((card) => card.rarity === rarity);
    const card = pool[random(pool.length)];
    const duplicate = (counts[card.key] ?? 0) > 0;
    counts[card.key] = (counts[card.key] ?? 0) + 1;
    streak = rarity === "common" ? streak + 1 : 0;

    const pullId = pullIds[index];
    const voucher = VOUCHERS[rarity];
    const code = voucher ? voucherCode() : null;
    const shards = duplicate ? DUPLICATE_SHARDS[rarity] : 0;
    const values = [pullId, userId, series.key, card.key, rarity, duplicate, code, source, now + index];
    statements.push(
      source === "free"
        ? {
            sql: `INSERT INTO gacha_pulls (id, user_id, series, card, rarity, duplicate, coupon_code, source, created_at, free_day)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${TODAY_VN_SQL})
                  ON CONFLICT (user_id, free_day) WHERE free_day IS NOT NULL DO NOTHING`,
            args: values,
          }
        : {
            sql: `INSERT INTO gacha_pulls (id, user_id, series, card, rarity, duplicate, coupon_code, source, created_at)
                  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
            args: [...values, ...guard.args],
          },
    );
    if (voucher && code) statements.push(couponStatement(code, voucher, now, guard));
    if (shards > 0) {
      statements.push({
        sql: `INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at) SELECT ?, ?, ?, 'duplicate', ?, ? WHERE ${guard.sql}`,
        args: [newId(), userId, shards, pullId, now + index, ...guard.args],
      });
    }
    results.push({ card: card.key, product: card.product, rarity, duplicate, couponCode: code, voucher: voucher?.label ?? null, shards });
  }

  const db = await getDb();
  const executed = await db.batch(statements);
  if (executed[1].rowsAffected === 0) return { ok: false, reason: cost > 0 ? "not_enough_coins" : "free_used" };
  const [balance, shards] = await Promise.all([getBalance(userId), getShardBalance(userId)]);
  return { ok: true, results, balance, shards };
}

export type CraftOutcome = { ok: true; result: PullResult; shards: number } | { ok: false; reason: "invalid" | "owned" | "not_enough_shards" };

// Ghép một thẻ còn thiếu bằng mảnh (chỉ thẻ Thường và Hiếm, xem CRAFT_COST). Trừ mảnh và thêm thẻ trong cùng giao dịch;
// điều kiện "đủ mảnh" và "chưa có thẻ" nằm ngay trong câu trừ mảnh nên bấm hai lần cũng chỉ ghép một thẻ.
export async function craft(userId: string, cardKey: string): Promise<CraftOutcome> {
  const card = findCard(cardKey);
  const series = seriesOfCard(cardKey);
  const cost = card ? CRAFT_COST[card.rarity] : undefined;
  if (!card || !series || !cost) return { ok: false, reason: "invalid" };
  const now = Date.now();
  const debitId = newId();
  const pullId = newId();
  const db = await getDb();
  const [, debit] = await db.batch([
    userLock(userId),
    {
      sql: `INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at)
            SELECT ?, ?, ?, 'craft', ?, ?
            WHERE (SELECT COALESCE(SUM(amount), 0) FROM gacha_shards WHERE user_id = ?) >= ?
              AND NOT EXISTS (SELECT 1 FROM gacha_pulls WHERE user_id = ? AND series = ? AND card = ?)`,
      args: [debitId, userId, -cost, pullId, now, userId, cost, userId, series.key, card.key],
    },
    {
      sql: `INSERT INTO gacha_pulls (id, user_id, series, card, rarity, duplicate, coupon_code, source, created_at)
            SELECT ?, ?, ?, ?, ?, false, NULL, 'craft', ? WHERE EXISTS (SELECT 1 FROM gacha_shards WHERE id = ?)`,
      args: [pullId, userId, series.key, card.key, card.rarity, now, debitId],
    },
  ]);
  if (debit.rowsAffected === 0) {
    const { owned } = await readPullState(userId, series);
    return { ok: false, reason: (owned[card.key] ?? 0) > 0 ? "owned" : "not_enough_shards" };
  }
  return {
    ok: true,
    result: { card: card.key, product: card.product, rarity: card.rarity, duplicate: false, couponCode: null, voucher: null, shards: 0 },
    shards: await getShardBalance(userId),
  };
}

export type ClaimOutcome = { status: "ok"; code: string } | { status: "incomplete" | "claimed" };

// Nhận thưởng gom đủ bộ (mọi thẻ của series): một mã giảm giá, một lần mỗi series (khoá chính gacha_rewards).
export async function claimSetReward(userId: string, series: GachaSeries = SERIES): Promise<ClaimOutcome> {
  const { owned } = await readPullState(userId, series);
  if (!series.cards.every((card) => (owned[card.key] ?? 0) > 0)) return { status: "incomplete" };
  const code = voucherCode();
  const now = Date.now();
  const db = await getDb();
  const [claim] = await db.batch([
    {
      sql: `INSERT INTO gacha_rewards (user_id, series, coupon_code, created_at)
            SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM coin_ledger WHERE user_id = ? AND reason = 'gacha-set' AND ref = ?)
            ON CONFLICT (user_id, series) DO NOTHING`,
      args: [userId, series.key, code, now, userId, series.key],
    },
    couponStatement(code, SET_VOUCHER, now, {
      sql: "EXISTS (SELECT 1 FROM gacha_rewards WHERE user_id = ? AND series = ? AND coupon_code = ?)",
      args: [userId, series.key, code],
    }),
  ]);
  return claim.rowsAffected > 0 ? { status: "ok", code } : { status: "claimed" };
}

// ---------- Hộp mù ----------

export type BoxShelf = { caseId: string | null; slots: (string | null)[] };

// Kệ hộp mù đang mở của khách: mỗi vị trí là mã thẻ đã mở, hoặc null nếu hộp còn niêm phong. Chỉ đọc; chưa có kệ thì
// trả kệ còn nguyên (kệ được xếp khi mở hộp đầu tiên). Thứ tự thẻ trong hộp chưa mở không bao giờ gửi ra trình duyệt.
export async function getBoxShelf(userId: string, series: GachaSeries = SERIES): Promise<BoxShelf> {
  const db = await getDb();
  const rows = (
    await db.execute({
      sql: `SELECT c.id, p.box_slot, p.card FROM gacha_box_cases c LEFT JOIN gacha_pulls p ON p.box_case = c.id
            WHERE c.user_id = ? AND c.series = ? AND c.finished_at IS NULL`,
      args: [userId, series.key],
    })
  ).rows;
  const slots: (string | null)[] = series.cards.map(() => null);
  for (const row of rows) if (row.box_slot !== null && row.box_slot !== undefined) slots[Number(row.box_slot)] = String(row.card);
  return { caseId: rows[0] ? String(rows[0].id) : null, slots };
}

function shuffle<T>(items: readonly T[], random: (n: number) => number): T[] {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index--) {
    const other = random(index + 1);
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

export type BoxOutcome =
  | { ok: true; result: PullResult; slot: number; balance: number; shards: number; finished: boolean }
  | { ok: false; reason: "invalid" | "opened" | "not_enough_coins" };

// Mở hộp ở vị trí `slot` của kệ đang mở (chưa có kệ thì xếp kệ mới: đủ các thẻ của series, thứ tự ngẫu nhiên). Trừ xu,
// ghi thẻ, cộng mảnh nếu trùng và đánh dấu kệ đã mở hết trong cùng giao dịch; điều kiện "hộp chưa mở" nằm trong câu trừ
// xu nên bấm hai lần chỉ trừ một lần.
// Kệ đang mở của khách; chưa có thì xếp kệ mới (đủ các thẻ của series, thứ tự ngẫu nhiên). null khi một yêu cầu khác
// vừa mở hộp cuối của kệ (kệ đã đóng, kệ mới chưa xếp): khách bấm lại là được.
async function ensureBoxCase(userId: string, random: (n: number) => number, series: GachaSeries): Promise<{ caseId: string; contents: string[] } | null> {
  const db = await getDb();
  const order = shuffle(
    series.cards.map((card) => card.key),
    random,
  );
  await db.execute({
    sql: `INSERT INTO gacha_box_cases (id, user_id, series, contents, created_at) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (user_id, series) WHERE finished_at IS NULL DO NOTHING`,
    args: [newId(), userId, series.key, order.join(","), Date.now()],
  });
  const shelf = (
    await db.execute({
      sql: "SELECT id, contents FROM gacha_box_cases WHERE user_id = ? AND series = ? AND finished_at IS NULL",
      args: [userId, series.key],
    })
  ).rows[0];
  return shelf ? { caseId: String(shelf.id), contents: String(shelf.contents).split(",") } : null;
}

const finishCaseStatement = (caseId: string, now: number, total: number): InStatement => ({
  sql: "UPDATE gacha_box_cases SET finished_at = ? WHERE id = ? AND finished_at IS NULL AND (SELECT COUNT(*) FROM gacha_pulls WHERE box_case = ?) >= ?",
  args: [now, caseId, caseId, total],
});

export async function openBox(userId: string, slot: number, random: (n: number) => number = randomInt, series: GachaSeries = SERIES): Promise<BoxOutcome> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= series.cards.length) return { ok: false, reason: "invalid" };
  const db = await getDb();
  const shelf = await ensureBoxCase(userId, random, series);
  if (!shelf) return { ok: false, reason: "invalid" };
  const { caseId } = shelf;
  const card = findCard(shelf.contents[slot]);
  if (!card) return { ok: false, reason: "invalid" };

  const { owned } = await readPullState(userId, series);
  const duplicate = (owned[card.key] ?? 0) > 0;
  const shards = duplicate ? DUPLICATE_SHARDS[card.rarity] : 0;
  const now = Date.now();
  const spendId = newId();
  const pullId = newId();
  const guard = "EXISTS (SELECT 1 FROM coin_ledger WHERE id = ?)";
  const statements: InStatement[] = [
    userLock(userId),
    {
      sql: `INSERT INTO coin_ledger (id, user_id, amount, reason, ref, note, created_at)
            SELECT ?, ?, ?, 'gacha', ?, ?, ?
            WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE user_id = ?) >= ?
              AND NOT EXISTS (SELECT 1 FROM gacha_pulls WHERE box_case = ? AND box_slot = ?)`,
      args: [spendId, userId, -BOX_COST, spendId, `Hộp mù số ${slot + 1}, ${series.name}`, now, userId, BOX_COST, caseId, slot],
    },
    {
      sql: `INSERT INTO gacha_pulls (id, user_id, series, card, rarity, duplicate, coupon_code, source, created_at, box_case, box_slot)
            SELECT ?, ?, ?, ?, ?, ?, NULL, 'box', ?, ?, ? WHERE ${guard}`,
      args: [pullId, userId, series.key, card.key, card.rarity, duplicate, now, caseId, slot, spendId],
    },
  ];
  if (shards > 0) {
    statements.push({
      sql: `INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at) SELECT ?, ?, ?, 'duplicate', ?, ? WHERE ${guard}`,
      args: [newId(), userId, shards, pullId, now, spendId],
    });
  }
  statements.push(finishCaseStatement(caseId, now, series.cards.length));
  const executed = await db.batch(statements);
  if (executed[1].rowsAffected === 0) {
    const opened = await db.execute({ sql: "SELECT 1 FROM gacha_pulls WHERE box_case = ? AND box_slot = ?", args: [caseId, slot] });
    return { ok: false, reason: opened.rows.length > 0 ? "opened" : "not_enough_coins" };
  }
  const [balance, shardBalance] = await Promise.all([getBalance(userId), getShardBalance(userId)]);
  return {
    ok: true,
    result: { card: card.key, product: card.product, rarity: card.rarity, duplicate, couponCode: null, voucher: null, shards },
    slot,
    balance,
    shards: shardBalance,
    finished: executed[executed.length - 1].rowsAffected > 0,
  };
}

export type BoxBatchOutcome =
  | { ok: true; results: (PullResult & { slot: number })[]; balance: number; shards: number; finished: boolean }
  | { ok: false; reason: "invalid" | "changed" | "not_enough_coins" };

// Mua và mở một lúc mọi hộp còn niêm phong trên kệ (giá = số hộp còn lại × BOX_COST), trong một giao dịch. Câu trừ xu
// kèm điều kiện "số hộp đã mở không đổi": nếu giữa chừng có hộp vừa bị mở ở nơi khác thì không trừ, không ghi gì.
export async function openAllBoxes(userId: string, random: (n: number) => number = randomInt, series: GachaSeries = SERIES): Promise<BoxBatchOutcome> {
  const db = await getDb();
  const shelf = await ensureBoxCase(userId, random, series);
  if (!shelf) return { ok: false, reason: "invalid" };
  const { caseId, contents } = shelf;
  const opened = new Set(
    (await db.execute({ sql: "SELECT box_slot FROM gacha_pulls WHERE box_case = ?", args: [caseId] })).rows.map((row) => Number(row.box_slot)),
  );
  const remaining = contents.map((_, slot) => slot).filter((slot) => !opened.has(slot));
  if (remaining.length === 0) return { ok: false, reason: "invalid" };
  const cost = remaining.length * BOX_COST;
  const { owned } = await readPullState(userId, series);
  const counts = { ...owned };
  const now = Date.now();
  const spendId = newId();
  const guard = "EXISTS (SELECT 1 FROM coin_ledger WHERE id = ?)";
  const statements: InStatement[] = [
    userLock(userId),
    {
      sql: `INSERT INTO coin_ledger (id, user_id, amount, reason, ref, note, created_at)
            SELECT ?, ?, ?, 'gacha', ?, ?, ?
            WHERE (SELECT COALESCE(SUM(amount), 0) FROM coin_ledger WHERE user_id = ?) >= ?
              AND (SELECT COUNT(*) FROM gacha_pulls WHERE box_case = ?) = ?`,
      args: [spendId, userId, -cost, spendId, `${remaining.length} hộp mù, ${series.name}`, now, userId, cost, caseId, opened.size],
    },
  ];
  const results: (PullResult & { slot: number })[] = [];
  for (const [index, slot] of remaining.entries()) {
    const card = findCard(contents[slot]);
    if (!card) return { ok: false, reason: "invalid" };
    const duplicate = (counts[card.key] ?? 0) > 0;
    counts[card.key] = (counts[card.key] ?? 0) + 1;
    const shards = duplicate ? DUPLICATE_SHARDS[card.rarity] : 0;
    const pullId = newId();
    statements.push({
      sql: `INSERT INTO gacha_pulls (id, user_id, series, card, rarity, duplicate, coupon_code, source, created_at, box_case, box_slot)
            SELECT ?, ?, ?, ?, ?, ?, NULL, 'box', ?, ?, ? WHERE ${guard}`,
      args: [pullId, userId, series.key, card.key, card.rarity, duplicate, now + index, caseId, slot, spendId],
    });
    if (shards > 0) {
      statements.push({
        sql: `INSERT INTO gacha_shards (id, user_id, amount, reason, ref, created_at) SELECT ?, ?, ?, 'duplicate', ?, ? WHERE ${guard}`,
        args: [newId(), userId, shards, pullId, now + index, spendId],
      });
    }
    results.push({ card: card.key, product: card.product, rarity: card.rarity, duplicate, couponCode: null, voucher: null, shards, slot });
  }
  statements.push(finishCaseStatement(caseId, now, series.cards.length));
  const executed = await db.batch(statements);
  if (executed[1].rowsAffected === 0) {
    const balance = await getBalance(userId);
    return { ok: false, reason: balance < cost ? "not_enough_coins" : "changed" };
  }
  const [balance, shardBalance] = await Promise.all([getBalance(userId), getShardBalance(userId)]);
  return { ok: true, results, balance, shards: shardBalance, finished: executed[executed.length - 1].rowsAffected > 0 };
}
