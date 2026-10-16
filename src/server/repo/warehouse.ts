import "server-only";
import { getDb } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";
import { DEFAULT_WAREHOUSE } from "./inventory";

export type LocationType = "storage" | "quarantine";
export type Location = { id: string; code: string; name: string; type: LocationType; isActive: boolean; onHand: number };
export type LocationInput = { code: string; name: string; type: LocationType };

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  note: string;
  isActive: boolean;
};
export type SupplierInput = Omit<Supplier, "id" | "isActive">;

// Vị trí đang có hàng: không đổi loại (sẽ lệch on_hand và quarantined của inventory), không ngừng dùng (YC-KHO-01).
const HAS_STOCK = "EXISTS (SELECT 1 FROM stock_levels s WHERE s.location_id = locations.id AND s.on_hand > 0)";

export async function listLocations(): Promise<Location[]> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT l.id, l.code, l.name, l.type, l.is_active,
           COALESCE((SELECT SUM(s.on_hand) FROM stock_levels s WHERE s.location_id = l.id), 0)::int AS on_hand
    FROM locations l WHERE l.warehouse_id = ${DEFAULT_WAREHOUSE} ORDER BY l.code`);
  return result.rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    type: row.type === "quarantine" ? "quarantine" : "storage",
    isActive: Boolean(row.is_active),
    onHand: Number(row.on_hand),
  }));
}

// Trả về id, hoặc null khi vị trí có hàng mà lại đổi loại. Ném lỗi ràng buộc khi trùng mã.
export async function saveLocation(id: string | null, input: LocationInput, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  if (id) {
    const result = await db.execute(
      withAudit(
        {
          sql: `UPDATE locations SET code = ?, name = ?, type = ? WHERE id = ? AND (type = ? OR NOT ${HAS_STOCK})`,
          args: [input.code, input.name, input.type, id, input.type],
        },
        entry,
      ),
    );
    return result.rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    {
      sql: `INSERT INTO locations (id, warehouse_id, code, name, type, created_at) VALUES (?, ${DEFAULT_WAREHOUSE}, ?, ?, ?, ?)`,
      args: [newIdValue, input.code, input.name, input.type, Date.now()],
    },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

// Ngừng dùng chỉ khi vị trí không còn hàng. Trả về false khi không đổi được.
export async function setLocationActive(id: string, active: boolean, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit(
      { sql: `UPDATE locations SET is_active = ? WHERE id = ? AND is_active <> ? AND (? OR NOT ${HAS_STOCK})`, args: [active, id, active, active] },
      entry,
    ),
  );
  return result.rowsAffected > 0;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM suppliers ORDER BY is_active DESC, name");
  return result.rows.map((row) => ({
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    contactName: String(row.contact_name),
    phone: String(row.phone),
    email: String(row.email),
    address: String(row.address),
    note: String(row.note),
    isActive: Boolean(row.is_active),
  }));
}

const supplierArgs = (input: SupplierInput) => [input.code, input.name, input.contactName, input.phone, input.email, input.address, input.note];

// Ném lỗi ràng buộc khi trùng mã.
export async function saveSupplier(id: string | null, input: SupplierInput, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  if (id) {
    const result = await db.execute(
      withAudit(
        {
          sql: "UPDATE suppliers SET code = ?, name = ?, contact_name = ?, phone = ?, email = ?, address = ?, note = ? WHERE id = ?",
          args: [...supplierArgs(input), id],
        },
        entry,
      ),
    );
    return result.rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    {
      sql: `INSERT INTO suppliers (code, name, contact_name, phone, email, address, note, id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [...supplierArgs(input), newIdValue, Date.now()],
    },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

export async function setSupplierActive(id: string, active: boolean, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit({ sql: "UPDATE suppliers SET is_active = ? WHERE id = ? AND is_active <> ?", args: [active, id, active] }, entry),
  );
  return result.rowsAffected > 0;
}

export type QuarantineRow = { variantId: string; sku: string; name: string; locationId: string; locationCode: string; qty: number };

// Hàng đang nằm ở vị trí cách ly (YC-KHO-09).
export async function listQuarantineStock(): Promise<QuarantineRow[]> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT s.variant_id, v.sku, p.name || ' (' || v.name || ')' AS name, s.location_id, l.code, s.on_hand
    FROM stock_levels s
    JOIN locations l ON l.id = s.location_id AND l.type = 'quarantine'
    JOIN product_variants v ON v.id = s.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE s.on_hand > 0 ORDER BY l.code, v.sku`);
  return result.rows.map((row) => ({
    variantId: String(row.variant_id),
    sku: String(row.sku),
    name: String(row.name),
    locationId: String(row.location_id),
    locationCode: String(row.code),
    qty: Number(row.on_hand),
  }));
}
