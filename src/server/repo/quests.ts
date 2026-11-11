import "server-only";
import { COMIC_CHAPTERS } from "@/data/comics";
import { CHECKIN_REWARD, COMIC_READ_REWARD, ONCE_QUESTS, STREAK_BONUS, STREAK_DAYS, orderCoins, type OnceQuestKey } from "@/lib/quests";
import { getDb } from "../db";
import { TODAY_VN_SQL, creditStatement, getBalance, listLedger, type LedgerEntry } from "./coins";

// Nhiệm vụ (/nhiem-vu). Tiến độ tính từ dữ liệu thật của khách; nhận thưởng thì tính lại rồi mới cộng xu (một lần cho mỗi
// (reason, ref) nhờ khoá duy nhất của coin_ledger).

export type QuestStatus = "locked" | "claimable" | "claimed";
export type QuestItem = {
  kind: "quest" | "comic";
  ref: string;
  title: string;
  description: string;
  reward: number;
  progress: number;
  target: number;
  status: QuestStatus;
  href: string;
};
export type OrderReward = { orderId: string; code: string; total: number; reward: number };
export type QuestBoard = {
  balance: number;
  today: string;
  checkedInToday: boolean;
  // Số ngày điểm danh liền tính tới hôm nay (hoặc hôm qua nếu hôm nay chưa điểm danh).
  streak: number;
  quests: QuestItem[];
  orderRewards: OrderReward[];
  history: LedgerEntry[];
};

const dayBefore = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function streakOf(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : dayBefore(today);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = dayBefore(cursor);
  }
  return count;
}

export async function getQuestBoard(userId: string): Promise<QuestBoard> {
  const db = await getDb();
  const [today, claimed, checkins, profile, wishlist, orders, reviews, posts, pulls, reads, rewardable] = await db.batch([
    `SELECT ${TODAY_VN_SQL} AS day`,
    { sql: "SELECT reason, ref FROM coin_ledger WHERE user_id = ? AND reason IN ('quest', 'comic', 'order')", args: [userId] },
    { sql: "SELECT ref FROM coin_ledger WHERE user_id = ? AND reason = 'checkin' ORDER BY ref DESC LIMIT 60", args: [userId] },
    {
      sql: "SELECT (phone <> '')::int + (EXISTS (SELECT 1 FROM customer_addresses WHERE user_id = ?))::int AS n FROM users WHERE id = ?",
      args: [userId, userId],
    },
    { sql: "SELECT COUNT(*)::int AS n FROM wishlist_items WHERE user_id = ?", args: [userId] },
    { sql: "SELECT COUNT(*)::int AS n FROM orders WHERE user_id = ? AND status = 'completed'", args: [userId] },
    { sql: "SELECT COUNT(*)::int AS n FROM reviews WHERE user_id = ?", args: [userId] },
    { sql: "SELECT COUNT(*)::int AS n FROM community_posts WHERE user_id = ? AND status = 'approved'", args: [userId] },
    { sql: "SELECT COUNT(*)::int AS n FROM gacha_pulls WHERE user_id = ?", args: [userId] },
    { sql: "SELECT chapter FROM comic_reads WHERE user_id = ?", args: [userId] },
    {
      sql: `SELECT o.id, o.code, o.total FROM orders o
            WHERE o.user_id = ? AND o.status = 'completed'
              AND NOT EXISTS (SELECT 1 FROM coin_ledger c WHERE c.user_id = o.user_id AND c.reason = 'order' AND c.ref = o.id)
            ORDER BY o.created_at DESC`,
      args: [userId],
    },
  ]);

  const day = String(today.rows[0].day);
  const got = new Set(claimed.rows.map((row) => `${row.reason}:${row.ref}`));
  const checkinDays = new Set(checkins.rows.map((row) => String(row.ref)));
  const progressOf: Record<OnceQuestKey, number> = {
    "ho-so": Number(profile.rows[0]?.n ?? 0),
    "yeu-thich": Number(wishlist.rows[0].n),
    "don-dau-tien": Number(orders.rows[0].n),
    "danh-gia": Number(reviews.rows[0].n),
    "cong-dong": Number(posts.rows[0].n),
    gacha: Number(pulls.rows[0].n),
  };
  const readChapters = new Set(reads.rows.map((row) => String(row.chapter)));

  const status = (done: boolean, key: string): QuestStatus => (got.has(key) ? "claimed" : done ? "claimable" : "locked");
  const quests: QuestItem[] = [
    ...ONCE_QUESTS.map((quest) => {
      const progress = Math.min(progressOf[quest.key], quest.target);
      return {
        kind: "quest" as const,
        ref: quest.key,
        title: quest.title,
        description: quest.description,
        reward: quest.reward,
        progress,
        target: quest.target,
        status: status(progress >= quest.target, `quest:${quest.key}`),
        href: quest.href,
      };
    }),
    ...COMIC_CHAPTERS.map((chapter) => ({
      kind: "comic" as const,
      ref: chapter.slug,
      title: `Đọc truyện: Chương ${chapter.number}`,
      description: `"${chapter.title}". Đọc tới khung cuối của chương.`,
      reward: COMIC_READ_REWARD,
      progress: readChapters.has(chapter.slug) ? 1 : 0,
      target: 1,
      status: status(readChapters.has(chapter.slug), `comic:${chapter.slug}`),
      href: `/truyen-tranh/${chapter.slug}`,
    })),
  ];

  return {
    balance: await getBalance(userId),
    today: day,
    checkedInToday: checkinDays.has(day),
    streak: streakOf(checkinDays, day),
    quests,
    orderRewards: rewardable.rows
      .map((row) => ({ orderId: String(row.id), code: String(row.code), total: Number(row.total), reward: orderCoins(Number(row.total)) }))
      .filter((item) => item.reward > 0),
    history: await listLedger(userId, 15),
  };
}

export type ClaimResult = { ok: true; amount: number } | { ok: false; reason: "not_ready" | "claimed" | "not_found" };

// Nhận thưởng một nhiệm vụ, một chương truyện hoặc một đơn hàng đã hoàn tất.
export async function claimReward(userId: string, kind: "quest" | "comic" | "order", ref: string): Promise<ClaimResult> {
  const board = await getQuestBoard(userId);
  let amount = 0;
  let note = "";
  if (kind === "order") {
    const order = board.orderRewards.find((item) => item.orderId === ref);
    if (!order) return { ok: false, reason: "not_found" };
    amount = order.reward;
    note = `Đơn ${order.code}`;
  } else {
    const quest = board.quests.find((item) => item.kind === kind && item.ref === ref);
    if (!quest) return { ok: false, reason: "not_found" };
    if (quest.status === "claimed") return { ok: false, reason: "claimed" };
    if (quest.status === "locked") return { ok: false, reason: "not_ready" };
    amount = quest.reward;
    note = quest.title;
  }
  const db = await getDb();
  const result = await db.execute(creditStatement(userId, amount, kind, ref, note));
  return result.rowsAffected > 0 ? { ok: true, amount } : { ok: false, reason: "claimed" };
}

// Điểm danh hôm nay (giờ Việt Nam). Đủ STREAK_DAYS ngày liền thì thưởng thêm. Trả về số xu nhận được, 0 nếu đã điểm danh.
export async function checkIn(userId: string): Promise<{ amount: number; streak: number }> {
  const db = await getDb();
  const [day] = (await db.execute(`SELECT ${TODAY_VN_SQL} AS day`)).rows;
  const today = String(day.day);
  const inserted = await db.execute(creditStatement(userId, CHECKIN_REWARD, "checkin", today, "Điểm danh"));
  if (inserted.rowsAffected === 0) return { amount: 0, streak: (await getQuestBoard(userId)).streak };
  const { streak } = await getQuestBoard(userId);
  let amount = CHECKIN_REWARD;
  if (streak > 0 && streak % STREAK_DAYS === 0) {
    const bonus = await db.execute(creditStatement(userId, STREAK_BONUS, "checkin-bonus", today, `Điểm danh ${STREAK_DAYS} ngày liền`));
    if (bonus.rowsAffected > 0) amount += STREAK_BONUS;
  }
  return { amount, streak };
}

// Ghi nhận đã đọc hết một chương (gọi khi khách cuộn tới khung cuối).
export async function markComicRead(userId: string, chapter: string): Promise<boolean> {
  if (!COMIC_CHAPTERS.some((item) => item.slug === chapter)) return false;
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO comic_reads (user_id, chapter, read_at) VALUES (?, ?, ?) ON CONFLICT (user_id, chapter) DO NOTHING",
    args: [userId, chapter, Date.now()],
  });
  return true;
}
