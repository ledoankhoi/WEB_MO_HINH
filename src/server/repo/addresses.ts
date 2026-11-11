import "server-only";
import { MAX_ADDRESSES, isAddressLabel, type Address, type AddressLabel } from "@/lib/account";
import { getDb, type InStatement, type Row } from "../db";
import { newId } from "../ids";

// Sổ địa chỉ của khách (YC-TKH-03, bảng customer_addresses, migration 018_customer_addresses). Mỗi tài khoản tối đa MAX_ADDRESSES địa chỉ, tối đa một địa chỉ mặc
// định (chỉ mục duy nhất idx_customer_addresses_default). Có địa chỉ thì luôn có đúng một địa chỉ mặc định. users.address, city
// là bản sao của địa chỉ mặc định (trang quản trị khách hàng và các chỗ cũ vẫn đọc hai cột này).

export type AddressInput = { label: AddressLabel; recipientName: string; phone: string; address: string; city: string };
export type SaveAddressResult = "ok" | "not_found" | "limit";

function toAddress(row: Row): Address {
  const label = String(row.label);
  return {
    id: String(row.id),
    label: isAddressLabel(label) ? label : "home",
    recipientName: String(row.recipient_name),
    phone: String(row.phone),
    address: String(row.address),
    city: String(row.city),
    isDefault: row.is_default === true,
  };
}

// Chép địa chỉ mặc định vào users.address, city (rỗng nếu sổ trống).
const syncProfile = (userId: string): InStatement => ({
  sql: `UPDATE users SET
          address = COALESCE((SELECT address FROM customer_addresses WHERE user_id = ? AND is_default), ''),
          city = COALESCE((SELECT city FROM customer_addresses WHERE user_id = ? AND is_default), '')
        WHERE id = ?`,
  args: [userId, userId, userId],
});

// Sổ trống mặc định hay vừa mất địa chỉ mặc định: lấy địa chỉ mới nhất làm mặc định.
const ensureDefault = (userId: string): InStatement => ({
  sql: `UPDATE customer_addresses SET is_default = true
        WHERE id = (SELECT id FROM customer_addresses WHERE user_id = ? ORDER BY created_at DESC, id LIMIT 1)
          AND NOT EXISTS (SELECT 1 FROM customer_addresses WHERE user_id = ? AND is_default)`,
  args: [userId, userId],
});

const clearDefault = (userId: string, exceptId: string): InStatement => ({
  sql: "UPDATE customer_addresses SET is_default = false WHERE user_id = ? AND is_default AND id <> ?",
  args: [userId, exceptId],
});

// Địa chỉ mặc định đứng đầu, rồi tới địa chỉ thêm gần nhất.
export async function listAddresses(userId: string): Promise<Address[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC, id",
    args: [userId],
  });
  return result.rows.map(toAddress);
}

// Thêm (`id` null) hoặc sửa một địa chỉ của chính tài khoản đó. `makeDefault` đặt làm mặc định; địa chỉ đầu tiên luôn
// là mặc định.
export async function saveAddress(userId: string, id: string | null, input: AddressInput, makeDefault: boolean): Promise<SaveAddressResult> {
  const db = await getDb();
  const now = Date.now();
  const fields = [input.label, input.recipientName, input.phone, input.address, input.city];

  if (id) {
    const owned = await db.execute({ sql: "SELECT 1 FROM customer_addresses WHERE id = ? AND user_id = ?", args: [id, userId] });
    if (owned.rows.length === 0) return "not_found";
    await db.batch([
      ...(makeDefault ? [clearDefault(userId, id)] : []),
      {
        sql: `UPDATE customer_addresses SET label = ?, recipient_name = ?, phone = ?, address = ?, city = ?, updated_at = ?,
                is_default = is_default OR ?
              WHERE id = ? AND user_id = ?`,
        args: [...fields, now, makeDefault, id, userId],
      },
      syncProfile(userId),
    ]);
    return "ok";
  }

  const count = await db.execute({ sql: "SELECT COUNT(*)::int AS n FROM customer_addresses WHERE user_id = ?", args: [userId] });
  if (Number(count.rows[0].n) >= MAX_ADDRESSES) return "limit";
  const newAddressId = newId();
  await db.batch([
    ...(makeDefault ? [clearDefault(userId, newAddressId)] : []),
    {
      sql: `INSERT INTO customer_addresses (id, user_id, label, recipient_name, phone, address, city, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newAddressId, userId, ...fields, makeDefault, now, now],
    },
    ensureDefault(userId),
    syncProfile(userId),
  ]);
  return "ok";
}

export async function setDefaultAddress(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const owned = await db.execute({ sql: "SELECT 1 FROM customer_addresses WHERE id = ? AND user_id = ?", args: [id, userId] });
  if (owned.rows.length === 0) return false;
  await db.batch([
    clearDefault(userId, id),
    { sql: "UPDATE customer_addresses SET is_default = true WHERE id = ? AND user_id = ?", args: [id, userId] },
    syncProfile(userId),
  ]);
  return true;
}

// Xoá địa chỉ mặc định thì địa chỉ thêm gần nhất còn lại thành mặc định.
export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const [removed] = await db.batch([
    { sql: "DELETE FROM customer_addresses WHERE id = ? AND user_id = ?", args: [id, userId] },
    ensureDefault(userId),
    syncProfile(userId),
  ]);
  return removed.rowsAffected > 0;
}
