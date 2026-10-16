import "server-only";
import { couponDiscount, type CouponRejection } from "@/lib/pricing";
import { getDb, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";
import type { Guard } from "./inventory";

// Mã giảm giá (YC-BH-05, 06; QT-21). Hiệu lực so bằng đồng hồ CSDL (Q21).
const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
const USABLE = `c.is_active AND (c.starts_at IS NULL OR c.starts_at <= ${NOW}) AND (c.ends_at IS NULL OR c.ends_at > ${NOW})
  AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)`;

export type Coupon = {
  id: string;
  code: string;
  kind: "fixed" | "percent";
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  categoryId: string | null;
  categoryName: string | null;
  startsAt: number | null;
  endsAt: number | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  updatedAt: number;
};
export type CouponInput = Omit<Coupon, "id" | "categoryName" | "usedCount" | "updatedAt">;

export type CouponEvaluation =
  | { ok: true; coupon: Coupon; discount: number }
  | { ok: false; reason: CouponRejection; minSubtotal?: number };

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toCoupon(row: Row): Coupon {
  return {
    id: String(row.id),
    code: String(row.code),
    kind: row.kind === "percent" ? "percent" : "fixed",
    value: Number(row.value),
    maxDiscount: num(row.max_discount),
    minSubtotal: Number(row.min_subtotal),
    categoryId: row.category_id === null ? null : String(row.category_id),
    categoryName: row.category_name === null || row.category_name === undefined ? null : String(row.category_name),
    startsAt: num(row.starts_at),
    endsAt: num(row.ends_at),
    usageLimit: num(row.usage_limit),
    usedCount: Number(row.used_count),
    isActive: Boolean(row.is_active),
    updatedAt: Number(row.updated_at),
  };
}

export const normalizeCode = (code: string) => code.trim().toUpperCase();

export async function listCoupons(): Promise<Coupon[]> {
  const db = await getDb();
  const result = await db.execute(
    "SELECT c.*, cat.name AS category_name FROM coupons c LEFT JOIN categories cat ON cat.id = c.category_id ORDER BY c.created_at DESC",
  );
  return result.rows.map(toCoupon);
}

// Kiểm tra mã trên các dòng giỏ (giá đã lấy từ CSDL). Đơn tối thiểu tính trên cả giỏ; phần được giảm chỉ gồm
// sản phẩm thuộc danh mục của mã (hoặc danh mục con của nó) khi mã giới hạn danh mục.
export async function evaluateCoupon(code: string, lines: readonly { variantId: string; price: number; quantity: number }[]): Promise<CouponEvaluation> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT c.*, c.starts_at > ${NOW} AS not_started, c.ends_at <= ${NOW} AS expired,
            (c.usage_limit IS NOT NULL AND c.used_count >= c.usage_limit) AS exhausted
          FROM coupons c WHERE c.code = ?`,
    args: [normalizeCode(code)],
  });
  const row = result.rows[0];
  if (!row) return { ok: false, reason: "not_found" };
  const coupon = toCoupon(row);
  if (!coupon.isActive) return { ok: false, reason: "inactive" };
  if (row.not_started) return { ok: false, reason: "not_started" };
  if (row.expired) return { ok: false, reason: "expired" };
  if (row.exhausted) return { ok: false, reason: "exhausted" };
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  if (subtotal < coupon.minSubtotal) return { ok: false, reason: "min_subtotal", minSubtotal: coupon.minSubtotal };

  let eligible = subtotal;
  if (coupon.categoryId && lines.length > 0) {
    const matched = await db.execute({
      sql: `SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories cat ON cat.id = p.category_id
            WHERE v.id IN (${lines.map(() => "?").join(", ")}) AND (cat.id = ? OR cat.parent_id = ?)`,
      args: [...lines.map((l) => l.variantId), coupon.categoryId, coupon.categoryId],
    });
    const ids = new Set(matched.rows.map((r) => String(r.id)));
    eligible = lines.filter((l) => ids.has(l.variantId)).reduce((sum, l) => sum + l.price * l.quantity, 0);
  }
  const discount = couponDiscount(coupon, eligible);
  if (discount <= 0) return { ok: false, reason: "category" };
  return { ok: true, coupon, discount };
}

// Lệnh ghi lượt dùng trong giao dịch đặt hàng. Mã vừa bị tắt, sửa, hết hạn hoặc hết lượt thì truy vấn con trả
// NULL và vi phạm NOT NULL; hai đơn tranh lượt cuối thì đơn sau vi phạm usage_valid. Cả lô bị huỷ.
export function redeemStatements(coupon: Coupon, orderId: string, amount: number, now: number): InStatement[] {
  return [
    {
      sql: `INSERT INTO coupon_redemptions (coupon_id, order_id, amount, created_at)
            SELECT c.id, ?, ?, ? FROM (SELECT 1) one LEFT JOIN coupons c ON c.id = ? AND c.updated_at = ? AND ${USABLE}`,
      args: [orderId, amount, now, coupon.id, coupon.updatedAt],
    },
    { sql: "UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", args: [coupon.id] },
  ];
}

// Trả lượt khi đơn bị huỷ (EC-07); chỉ chạy khi `guard` đúng và chỉ một lần cho mỗi đơn.
export function releaseStatements(orderId: string, guard: Guard, now: number): InStatement[] {
  return [
    {
      sql: `UPDATE coupons SET used_count = used_count - 1
            WHERE id = (SELECT coupon_id FROM coupon_redemptions WHERE order_id = ? AND released_at IS NULL) AND ${guard.sql}`,
      args: [orderId, ...guard.args],
    },
    {
      sql: `UPDATE coupon_redemptions SET released_at = ? WHERE order_id = ? AND released_at IS NULL AND ${guard.sql}`,
      args: [now, orderId, ...guard.args],
    },
  ];
}

const couponArgs = (input: CouponInput) => [
  normalizeCode(input.code),
  input.kind,
  input.value,
  input.maxDiscount,
  input.minSubtotal,
  input.categoryId,
  input.startsAt,
  input.endsAt,
  input.usageLimit,
  input.isActive,
];

// Trả về id, hoặc "duplicate" khi trùng mã, null khi không tìm thấy hay hạn mức nhỏ hơn số lượt đã dùng.
export async function saveCoupon(id: string | null, input: CouponInput, entry: AuditEntry): Promise<string | "duplicate" | null> {
  const db = await getDb();
  const now = Date.now();
  try {
    if (id) {
      const result = await db.execute(
        withAudit(
          {
            sql: `UPDATE coupons SET code = ?, kind = ?, value = ?, max_discount = ?, min_subtotal = ?, category_id = ?, starts_at = ?, ends_at = ?,
                    usage_limit = ?, is_active = ?, updated_at = ? WHERE id = ?`,
            args: [...couponArgs(input), now, id],
          },
          entry,
        ),
      );
      return result.rowsAffected > 0 ? id : null;
    }
    const newIdValue = newId();
    await db.batch([
      {
        sql: `INSERT INTO coupons (code, kind, value, max_discount, min_subtotal, category_id, starts_at, ends_at, usage_limit, is_active, id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [...couponArgs(input), newIdValue, now, now],
      },
      auditStatement({ ...entry, entityId: newIdValue }),
    ]);
    return newIdValue;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return "duplicate";
    if ((error as { code?: string }).code === "23514") return null;
    throw error;
  }
}
