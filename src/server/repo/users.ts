import "server-only";
import { auditStatement, withAudit, type AuditEntry } from "./audit";
import { isRole, type Role } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/types";
import { getDb, type Row } from "../db";
import { newId } from "../ids";

function toUser(row: Row): CurrentUser {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    phone: String(row.phone),
    address: String(row.address),
    city: String(row.city),
    role: isRole(row.role) ? row.role : "customer",
    marketingConsent: Boolean(row.marketing_consent),
    emailVerified: row.email_verified_at !== null && row.email_verified_at !== undefined,
  };
}

// Chỉ dùng khi đăng nhập: đây là hàm duy nhất trả về password_hash.
export async function findCredentialsByEmail(
  email: string,
): Promise<{ id: string; passwordHash: string; role: Role; isActive: boolean } | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT id, password_hash, role, is_active FROM users WHERE email = ?",
    args: [email],
  });
  const row = result.rows[0];
  return row
    ? {
        id: String(row.id),
        passwordHash: String(row.password_hash),
        role: isRole(row.role) ? row.role : "customer",
        isActive: row.is_active === true,
      }
    : null;
}

export async function findPasswordHash(userId: string): Promise<string | null> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT password_hash FROM users WHERE id = ?", args: [userId] });
  return result.rows[0] ? String(result.rows[0].password_hash) : null;
}

// Ném lỗi ràng buộc (xem isConstraintError) nếu email đã được đăng ký.
export async function insertUser(input: { email: string; name: string; phone: string; passwordHash: string; marketingConsent?: boolean }): Promise<string> {
  const db = await getDb();
  const id = newId();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO users (id, email, name, phone, password_hash, role, marketing_consent, marketing_consent_at, created_at)
          VALUES (?, ?, ?, ?, ?, 'customer', ?, ?, ?)`,
    args: [id, input.email, input.name, input.phone, input.passwordHash, Boolean(input.marketingConsent), input.marketingConsent ? now : null, now],
  });
  return id;
}

// Hồ sơ ở trang Cài đặt: họ tên, số điện thoại. Địa chỉ nằm ở sổ địa chỉ (repo/addresses.ts), đồng ý nhận tin ở
// setMarketingConsent.
export async function updateUserProfile(userId: string, input: { name: string; phone: string }): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "UPDATE users SET name = ?, phone = ? WHERE id = ?", args: [input.name, input.phone, userId] });
}

// Thời điểm đồng ý chỉ đổi khi đổi lựa chọn (YC-KH-04).
export async function setMarketingConsent(userId: string, consent: boolean): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `UPDATE users SET
            marketing_consent_at = CASE WHEN marketing_consent = ? THEN marketing_consent_at WHEN ? THEN ?::bigint ELSE NULL END,
            marketing_consent = ?
          WHERE id = ?`,
    args: [consent, consent, Date.now(), consent, userId],
  });
}

// Số phiên đăng nhập còn hạn của tài khoản (mỗi trình duyệt, thiết bị đã đăng nhập là một phiên).
export async function countActiveSessions(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*)::int AS n FROM sessions WHERE user_id = ? AND expires_at > extract(epoch from now()) * 1000",
    args: [userId],
  });
  return Number(result.rows[0].n);
}

// Đăng xuất mọi thiết bị khác, giữ phiên đang dùng. Trả về số phiên đã xoá.
export async function endOtherSessions(userId: string, keepSessionId: string | null): Promise<number> {
  const db = await getDb();
  const result = await db.execute({ sql: "DELETE FROM sessions WHERE user_id = ? AND id <> ?", args: [userId, keepSessionId ?? ""] });
  return result.rowsAffected;
}

// Số đơn chưa xong (chưa hoàn tất, chưa huỷ). Còn đơn như vậy thì chưa cho xoá tài khoản.
export async function countOpenOrders(userId: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*)::int AS n FROM orders WHERE user_id = ? AND status NOT IN ('completed', 'cancelled')",
    args: [userId],
  });
  return Number(result.rows[0].n);
}

// Khách tự xoá tài khoản. Dòng users được giữ (đơn hàng, đánh giá tham chiếu tới) nhưng ẩn danh: email đổi thành địa
// chỉ không dùng được (email cũ đăng ký lại được), xoá họ tên, số điện thoại, địa chỉ, mật khẩu thay bằng giá trị ngẫu
// nhiên, khoá đăng nhập. Xoá phiên, sổ địa chỉ, danh sách yêu thích, yêu cầu báo có hàng. Đơn hàng cũ giữ nguyên để
// đối soát sổ sách; đánh giá giữ nội dung, tên người viết hiện "Tài khoản đã xoá". Ghi một dòng nhật ký, cùng giao dịch.
export async function anonymizeAccount(userId: string, randomPasswordHash: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.batch([
    {
      sql: `UPDATE users SET email = ?, name = 'Tài khoản đã xoá', phone = '', address = '', city = '', password_hash = ?,
              is_active = false, marketing_consent = false, marketing_consent_at = NULL, deleted_at = ?
            WHERE id = ? AND deleted_at IS NULL`,
      args: [`da-xoa-${userId}@robotica.invalid`, randomPasswordHash, now, userId],
    },
    { sql: "DELETE FROM sessions WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM customer_addresses WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM wishlist_items WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM stock_alerts WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM recently_viewed WHERE user_id = ?", args: [userId] },
    { sql: "DELETE FROM oauth_identities WHERE user_id = ?", args: [userId] },
    // Mã giảm giá trúng gacha chưa dùng thì tắt (không ai dùng được nữa).
    {
      sql: `UPDATE coupons SET is_active = false, updated_at = ?
            WHERE code IN (SELECT coupon_code FROM gacha_pulls WHERE user_id = ? AND coupon_code IS NOT NULL
                           UNION SELECT coupon_code FROM gacha_rewards WHERE user_id = ? AND coupon_code IS NOT NULL)
              AND used_count = 0`,
      args: [now, userId, userId],
    },
    auditStatement({
      actor: { id: userId, role: "customer" },
      action: "customer.self_delete",
      entity: "users",
      entityId: userId,
      summary: "Khách tự xoá tài khoản (thông tin cá nhân đã ẩn danh)",
    }),
  ]);
}

// Dữ liệu cá nhân của khách để tải về (trang Cài đặt > Quyền riêng tư). Không có mật khẩu, mã phiên.
export async function exportAccountData(userId: string) {
  const db = await getDb();
  const [profile, addresses, orders, items, reviews, wishlist, alerts, coins, pulls, shards, rewards, posts, comments, viewed, identities] = await db.batch([
    { sql: "SELECT email, name, phone, marketing_consent, marketing_consent_at, created_at FROM users WHERE id = ?", args: [userId] },
    { sql: "SELECT label, recipient_name, phone, address, city, is_default, created_at FROM customer_addresses WHERE user_id = ? ORDER BY created_at", args: [userId] },
    {
      sql: `SELECT id, code, status, payment_method, payment_status, shipping_status, customer_name, customer_phone, customer_email,
              shipping_address, shipping_city, note, subtotal, discount, coupon_code, shipping_fee, total, created_at
            FROM orders WHERE user_id = ? ORDER BY created_at`,
      args: [userId],
    },
    {
      sql: `SELECT i.order_id, i.product_name, i.variant_name, i.sku, i.unit_price, i.quantity
            FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.user_id = ? ORDER BY i.id`,
      args: [userId],
    },
    {
      sql: `SELECT p.name AS product, r.rating, r.comment, r.status, r.created_at
            FROM reviews r JOIN products p ON p.id = r.product_id WHERE r.user_id = ? ORDER BY r.created_at`,
      args: [userId],
    },
    {
      sql: "SELECT p.name AS product, w.created_at FROM wishlist_items w JOIN products p ON p.id = w.product_id WHERE w.user_id = ? ORDER BY w.created_at",
      args: [userId],
    },
    {
      sql: `SELECT p.name AS product, v.name AS variant, a.contact, a.created_at, a.notified_at
            FROM stock_alerts a JOIN product_variants v ON v.id = a.variant_id JOIN products p ON p.id = v.product_id
            WHERE a.user_id = ? ORDER BY a.created_at`,
      args: [userId],
    },
    { sql: "SELECT amount, reason, note, created_at FROM coin_ledger WHERE user_id = ? ORDER BY created_at", args: [userId] },
    { sql: "SELECT series, card, rarity, duplicate, coupon_code, source, created_at FROM gacha_pulls WHERE user_id = ? ORDER BY created_at", args: [userId] },
    { sql: "SELECT amount, reason, created_at FROM gacha_shards WHERE user_id = ? ORDER BY created_at", args: [userId] },
    { sql: "SELECT series, coupon_code, created_at FROM gacha_rewards WHERE user_id = ? ORDER BY created_at", args: [userId] },
    { sql: "SELECT topic, body, status, created_at FROM community_posts WHERE user_id = ? ORDER BY created_at", args: [userId] },
    { sql: "SELECT post_id, body, status, created_at FROM community_comments WHERE user_id = ? ORDER BY created_at", args: [userId] },
    {
      sql: "SELECT p.name AS product, r.viewed_at FROM recently_viewed r JOIN products p ON p.id = r.product_id WHERE r.user_id = ? ORDER BY r.viewed_at DESC",
      args: [userId],
    },
    { sql: "SELECT provider, email, created_at FROM oauth_identities WHERE user_id = ? ORDER BY provider", args: [userId] },
  ]);
  const time = (value: unknown) => (value === null || value === undefined ? null : new Date(Number(value)).toISOString());
  const user = profile.rows[0];
  return {
    profile: user && {
      email: String(user.email),
      name: String(user.name),
      phone: String(user.phone),
      marketingConsent: Boolean(user.marketing_consent),
      marketingConsentAt: time(user.marketing_consent_at),
      createdAt: time(user.created_at),
    },
    addresses: addresses.rows.map((row) => ({
      label: String(row.label),
      recipientName: String(row.recipient_name),
      phone: String(row.phone),
      address: String(row.address),
      city: String(row.city),
      isDefault: row.is_default === true,
      createdAt: time(row.created_at),
    })),
    orders: orders.rows.map((row) => ({
      code: String(row.code),
      status: String(row.status),
      paymentMethod: String(row.payment_method),
      paymentStatus: String(row.payment_status),
      shippingStatus: String(row.shipping_status),
      customerName: String(row.customer_name),
      customerPhone: String(row.customer_phone),
      customerEmail: String(row.customer_email),
      shippingAddress: String(row.shipping_address),
      shippingCity: String(row.shipping_city),
      note: String(row.note),
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      couponCode: row.coupon_code === null ? null : String(row.coupon_code),
      shippingFee: Number(row.shipping_fee),
      total: Number(row.total),
      createdAt: time(row.created_at),
      items: items.rows
        .filter((item) => item.order_id === row.id)
        .map((item) => ({
          product: String(item.product_name),
          variant: String(item.variant_name),
          sku: String(item.sku),
          unitPrice: Number(item.unit_price),
          quantity: Number(item.quantity),
        })),
    })),
    reviews: reviews.rows.map((row) => ({
      product: String(row.product),
      rating: Number(row.rating),
      comment: String(row.comment),
      status: String(row.status),
      createdAt: time(row.created_at),
    })),
    wishlist: wishlist.rows.map((row) => ({ product: String(row.product), addedAt: time(row.created_at) })),
    recentlyViewed: viewed.rows.map((row) => ({ product: String(row.product), viewedAt: time(row.viewed_at) })),
    linkedLogins: identities.rows.map((row) => ({ provider: String(row.provider), email: String(row.email), linkedAt: time(row.created_at) })),
    stockAlerts: alerts.rows.map((row) => ({
      product: String(row.product),
      variant: String(row.variant),
      contact: String(row.contact),
      createdAt: time(row.created_at),
      notifiedAt: time(row.notified_at),
    })),
    coins: {
      balance: coins.rows.reduce((sum, row) => sum + Number(row.amount), 0),
      history: coins.rows.map((row) => ({ amount: Number(row.amount), reason: String(row.reason), note: String(row.note), createdAt: time(row.created_at) })),
    },
    gachaPulls: pulls.rows.map((row) => ({
      series: String(row.series),
      card: String(row.card),
      rarity: String(row.rarity),
      duplicate: row.duplicate === true,
      couponCode: row.coupon_code === null ? null : String(row.coupon_code),
      source: String(row.source),
      createdAt: time(row.created_at),
    })),
    gachaShards: {
      balance: shards.rows.reduce((sum, row) => sum + Number(row.amount), 0),
      history: shards.rows.map((row) => ({ amount: Number(row.amount), reason: String(row.reason), createdAt: time(row.created_at) })),
    },
    gachaRewards: rewards.rows.map((row) => ({ series: String(row.series), couponCode: row.coupon_code === null ? null : String(row.coupon_code), createdAt: time(row.created_at) })),
    communityPosts: posts.rows.map((row) => ({ topic: String(row.topic), body: String(row.body), status: String(row.status), createdAt: time(row.created_at) })),
    communityComments: comments.rows.map((row) => ({ postId: String(row.post_id), body: String(row.body), status: String(row.status), createdAt: time(row.created_at) })),
  };
}

// Đổi mật khẩu và đăng xuất mọi phiên khác của tài khoản trong cùng một giao dịch.
export async function updateUserPassword(userId: string, passwordHash: string, keepSessionId: string | null): Promise<void> {
  const db = await getDb();
  await db.batch(
    [
      { sql: "UPDATE users SET password_hash = ? WHERE id = ?", args: [passwordHash, userId] },
      { sql: "DELETE FROM sessions WHERE user_id = ? AND id <> ?", args: [userId, keepSessionId ?? ""] },
    ]
  );
}

export async function insertSession(sessionId: string, userId: string, expiresAt: number): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [sessionId, userId, expiresAt, Date.now()],
  });
}

export async function findSessionUser(sessionId: string): Promise<CurrentUser | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT u.id, u.email, u.name, u.phone, u.address, u.city, u.role, u.marketing_consent, u.email_verified_at
          FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND s.expires_at > extract(epoch from now()) * 1000 AND u.is_active`,
    // Dùng đồng hồ của CSDL: Date.now() trong lúc dựng trang bị Next.js coi là giá trị không ổn định.
    args: [sessionId],
  });
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [sessionId] });
}

export type CustomerSummary = Pick<CurrentUser, "id" | "email" | "name" | "phone" | "city" | "marketingConsent"> & {
  isActive: boolean;
  marketingConsentAt: number | null;
  createdAt: number;
  orderCount: number;
  // Chỉ tính các đơn đã hoàn tất, giống doanh thu ở getOrderStats.
  spent: number;
};

export async function listCustomers(query: {
  q?: string;
  id?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: CustomerSummary[]; total: number }> {
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const page = Math.max(query.page ?? 1, 1);
  const where = ["u.role = 'customer'"];
  const args: (string | number)[] = [];
  if (query.id) {
    where.push("u.id = ?");
    args.push(query.id);
  }
  if (query.q) {
    const like = `%${query.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(u.name ILIKE ? ESCAPE '\\' OR u.email ILIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')");
    args.push(like, like, like);
  }
  const whereSql = where.join(" AND ");
  const db = await getDb();
  const [count, rows] = await db.batch(
    [
      { sql: `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, args },
      {
        sql: `SELECT u.id, u.email, u.name, u.phone, u.city, u.created_at, u.is_active, u.marketing_consent, u.marketing_consent_at,
                (SELECT COUNT(*) FROM orders WHERE user_id = u.id) AS order_count,
                (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = u.id AND status = 'completed') AS spent
              FROM users u WHERE ${whereSql} ORDER BY u.created_at DESC, u.id LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      },
    ]
  );
  return {
    items: rows.rows.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      phone: String(row.phone),
      city: String(row.city),
      isActive: Boolean(row.is_active),
      marketingConsent: Boolean(row.marketing_consent),
      marketingConsentAt: row.marketing_consent_at === null ? null : Number(row.marketing_consent_at),
      createdAt: Number(row.created_at),
      orderCount: Number(row.order_count),
      spent: Number(row.spent),
    })),
    total: Number(count.rows[0].total),
  };
}

// Địa chỉ giao hàng khách đã dùng (lấy từ đơn; chưa có sổ địa chỉ).
export async function listCustomerAddresses(userId: string): Promise<{ name: string; phone: string; address: string; city: string }[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT customer_name, customer_phone, shipping_address, shipping_city, MAX(created_at) AS last_used FROM orders WHERE user_id = ?
          GROUP BY customer_name, customer_phone, shipping_address, shipping_city ORDER BY last_used DESC LIMIT 10`,
    args: [userId],
  });
  return result.rows.map((row) => ({ name: String(row.customer_name), phone: String(row.customer_phone), address: String(row.shipping_address), city: String(row.shipping_city) }));
}

// YC-KH-03: khoá, mở khoá tài khoản khách; khoá thì xoá mọi phiên.
export async function setCustomerActive(userId: string, active: boolean, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const results = await db.batch([
    withAudit({ sql: "UPDATE users SET is_active = ? WHERE id = ? AND role = 'customer' AND is_active <> ?", args: [active, userId, active] }, entry),
    { sql: "DELETE FROM sessions WHERE user_id = ? AND NOT ?", args: [userId, active] },
  ]);
  return results[0].rowsAffected > 0;
}
