import "server-only";
import { ALERT_KEYS, ALERT_KINDS, type AdminAlerts, type AlertEvent, type AlertKey } from "@/lib/admin-alerts";
import { formatVnd } from "@/lib/format";
import { confirmableSql } from "@/lib/order-flow";
import { QA_TODO_COUNT_SQL } from "./questions";
import { CHAT_WAITING_SQL } from "./chat";
import { NEEDS_ACTION_SQL } from "@/lib/order-stage";
import { can, type Role } from "@/lib/permissions";
import { getDb, type InStatement, type InValue } from "../db";

// Mốc thời gian lấy từ đồng hồ CSDL (không gọi Date.now() lúc dựng trang).
const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
const HOUR = 3600 * 1000;

// Mỗi loại thông báo là một câu đếm; giữ khớp với bộ lọc của trang mà thông báo mở ra.
const COUNT_SQL: Record<AlertKey, InStatement> = {
  orders: `SELECT COUNT(*) AS n FROM orders o WHERE ${NEEDS_ACTION_SQL}`,
  overdueTransfers: {
    sql: `SELECT COUNT(*) AS n FROM orders WHERE payment_method = 'bank' AND status = 'pending' AND payment_status = 'unpaid' AND created_at < ${NOW} - ?`,
    args: [48 * HOUR],
  },
  refunds: "SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND payment_status IN ('paid', 'deposit_paid')",
  returns: "SELECT COUNT(*) AS n FROM return_requests WHERE status = 'requested'",
  returnRefunds: `SELECT COUNT(*) AS n FROM return_requests r JOIN stock_documents d ON d.id = r.document_id
                    WHERE r.status = 'approved' AND d.status = 'posted'`,
  toPack: "SELECT COUNT(*) AS n FROM orders WHERE status = 'processing' AND shipping_status = 'not_created'",
  // Đợt đặt trước có đơn chờ hàng (đã đủ điều kiện nhận) mà phiên bản đã có hàng chưa giữ cho ai: cần bấm phân bổ.
  preorderArrived: `SELECT COUNT(*) AS n FROM preorder_offers po WHERE po.status <> 'ended'
                      AND COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = po.variant_id), 0) > 0
                      AND EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                                  WHERE oi.preorder_offer_id = po.id AND o.status IN ('pending', 'confirmed') AND ${confirmableSql("o.")}
                                    AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.order_id = o.id AND m.variant_id = oi.variant_id AND m.type = 'reserve'))`,
  submittedDocs: "SELECT COUNT(*) AS n FROM stock_documents WHERE status = 'submitted'",
  quarantine: "SELECT COUNT(*) AS n FROM stock_levels s JOIN locations l ON l.id = s.location_id AND l.type = 'quarantine' WHERE s.on_hand > 0",
  restocked: `SELECT COUNT(*) AS n FROM stock_alerts a WHERE a.notified_at IS NULL
                AND COALESCE((SELECT SUM(i.on_hand - i.reserved) FROM inventory i WHERE i.variant_id = a.variant_id), 0) > 0`,
  reviews: "SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'",
  chat: CHAT_WAITING_SQL,
  questions: QA_TODO_COUNT_SQL,
  posts: "SELECT COUNT(*) AS n FROM community_posts WHERE status = 'pending'",
  reports: `SELECT COUNT(*) AS n FROM community_posts p WHERE EXISTS (
              SELECT 1 FROM community_reports r WHERE r.resolved_at IS NULL
                AND (r.post_id = p.id OR r.comment_id IN (SELECT id FROM community_comments WHERE post_id = p.id)))`,
  banners: {
    sql: `SELECT COUNT(*) AS n FROM banners WHERE status = 'published' AND ends_at > ${NOW} AND ends_at <= ${NOW} + ?`,
    args: [3 * 24 * HOUR],
  },
};

type Row = Record<string, unknown>;

// Việc mới nhất của mỗi loại có thông báo nổi. Trình duyệt so `at` với lần đã thấy để chỉ báo việc mới.
const EVENT_SQL: Record<AlertEvent["kind"], { sql: string; toEvent: (row: Row) => AlertEvent }> = {
  orders: {
    sql: "SELECT id, code, customer_name, total, created_at FROM orders ORDER BY created_at DESC LIMIT 1",
    toEvent: (row) => ({
      kind: "orders",
      id: String(row.id),
      at: Number(row.created_at),
      text: `Đơn hàng mới ${row.code} · ${row.customer_name} · ${formatVnd(Number(row.total))}`,
      href: `/admin/don-hang/${row.id}`,
    }),
  },
  posts: {
    sql: `SELECT p.id, p.created_at, u.name FROM community_posts p JOIN users u ON u.id = p.user_id
          WHERE p.status = 'pending' ORDER BY p.created_at DESC LIMIT 1`,
    toEvent: (row) => ({
      kind: "posts",
      id: String(row.id),
      at: Number(row.created_at),
      text: `Bài cộng đồng mới chờ duyệt · ${row.name}`,
      href: "/admin/cong-dong",
    }),
  },
  chat: {
    sql: `SELECT m.id, m.created_at, m.body, m.thread_id FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
          WHERE m.sender = 'customer' AND t.status = 'open' ORDER BY m.id DESC LIMIT 1`,
    toEvent: (row) => ({
      kind: "chat",
      id: String(row.id),
      at: Number(row.created_at),
      text: `Tin nhắn mới: ${String(row.body).slice(0, 60)}`,
      href: `/admin/chat?id=${row.thread_id}`,
    }),
  },
  reviews: {
    sql: `SELECT r.id, r.created_at, r.rating, p.name FROM reviews r JOIN products p ON p.id = r.product_id
          WHERE r.status = 'pending' ORDER BY r.created_at DESC LIMIT 1`,
    toEvent: (row) => ({
      kind: "reviews",
      id: String(row.id),
      at: Number(row.created_at),
      text: `Đánh giá mới chờ duyệt · ${row.rating} sao · ${row.name}`,
      href: "/admin/danh-gia?trang-thai=pending",
    }),
  },
};

// Thông báo cho một vai trò: chỉ đếm các loại vai trò đó có quyền. Mọi câu đếm và việc mới nhất gộp thành một câu SQL
// (mỗi câu con là một cột), tức một lượt đi về CSDL thay vì mười mấy lượt: layout quản trị gọi hàm này mỗi lần dựng,
// và thanh bên ở mọi tab quản trị đang mở hỏi lại mỗi 20 giây.
export async function adminAlerts(role: Role): Promise<AdminAlerts> {
  const keys = ALERT_KEYS.filter((key) => can(role, ALERT_KINDS[key].permission));
  const eventKinds = (Object.keys(EVENT_SQL) as AlertEvent["kind"][]).filter((kind) => keys.includes(kind));
  if (keys.length === 0) return { counts: {}, events: [] };

  const columns: string[] = [];
  const args: InValue[] = [];
  for (const key of keys) {
    const statement = COUNT_SQL[key];
    const { sql, args: more = [] } = typeof statement === "string" ? { sql: statement } : statement;
    columns.push(`(${sql}) AS "${key}"`);
    args.push(...more);
  }
  for (const kind of eventKinds) columns.push(`(SELECT row_to_json(e)::text FROM (${EVENT_SQL[kind].sql}) e) AS "event_${kind}"`);

  const db = await getDb();
  const row = (await db.execute({ sql: `SELECT ${columns.join(",\n")}`, args })).rows[0];
  const counts: AdminAlerts["counts"] = {};
  for (const key of keys) counts[key] = Number(row[key]);
  const events = eventKinds.flatMap((kind) => {
    const value = row[`event_${kind}`];
    return value ? [EVENT_SQL[kind].toEvent(JSON.parse(String(value)) as Row)] : [];
  });
  return { counts, events };
}
