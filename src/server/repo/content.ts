import "server-only";
import { getDb, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, type AuditEntry } from "./audit";

// Nội dung cửa hàng (docs/chuan/10 mục 4.4). Giờ hiệu lực so bằng đồng hồ CSDL (Q21).
const NOW = "(extract(epoch FROM now()) * 1000)::bigint";

export type BannerPlacement = "home_hero" | "home_strip";
export type Banner = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  imageMobileUrl: string | null;
  linkUrl: string;
  placement: BannerPlacement;
  sortOrder: number;
  startsAt: number | null;
  endsAt: number | null;
  status: "draft" | "published";
};
export type BannerInput = Omit<Banner, "id" | "status">;

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

function toBanner(row: Row): Banner {
  return {
    id: String(row.id),
    title: String(row.title),
    subtitle: String(row.subtitle),
    imageUrl: String(row.image_url),
    imageMobileUrl: row.image_mobile_url === null ? null : String(row.image_mobile_url),
    linkUrl: String(row.link_url),
    placement: row.placement === "home_strip" ? "home_strip" : "home_hero",
    sortOrder: Number(row.sort_order),
    startsAt: num(row.starts_at),
    endsAt: num(row.ends_at),
    status: row.status === "published" ? "published" : "draft",
  };
}

export async function listBanners(): Promise<Banner[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM banners ORDER BY placement, sort_order, created_at");
  return result.rows.map(toBanner);
}

// Banner khách thấy: đã xuất bản và đang trong khung thời gian (EC-04, EC-08).
export async function listActiveBanners(): Promise<Banner[]> {
  const db = await getDb();
  const result = await db.execute(`
    SELECT * FROM banners WHERE status = 'published'
      AND (starts_at IS NULL OR starts_at <= ${NOW}) AND (ends_at IS NULL OR ends_at > ${NOW})
    ORDER BY placement, sort_order, created_at`);
  return result.rows.map(toBanner);
}

// Banner đang xuất bản sẽ hết lịch trong `days` ngày tới (cho trang tổng quan).
export async function listBannersEndingSoon(days = 3): Promise<Banner[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT * FROM banners WHERE status = 'published' AND ends_at > ${NOW} AND ends_at <= ${NOW} + ? ORDER BY ends_at`,
    args: [days * 86400000],
  });
  return result.rows.map(toBanner);
}

const bannerArgs = (input: BannerInput) => [
  input.title,
  input.subtitle,
  input.imageUrl,
  input.imageMobileUrl,
  input.linkUrl,
  input.placement,
  input.sortOrder,
  input.startsAt,
  input.endsAt,
];

export async function saveBanner(id: string | null, input: BannerInput, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  const now = Date.now();
  if (id) {
    const result = await db.execute(
      withAudit(
        {
          sql: `UPDATE banners SET title = ?, subtitle = ?, image_url = ?, image_mobile_url = ?, link_url = ?, placement = ?, sort_order = ?,
                  starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?`,
          args: [...bannerArgs(input), now, id],
        },
        entry,
      ),
    );
    return result.rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    {
      sql: `INSERT INTO banners (title, subtitle, image_url, image_mobile_url, link_url, placement, sort_order, starts_at, ends_at, id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [...bannerArgs(input), newIdValue, now, now],
    },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

export async function setBannerStatus(id: string, status: "draft" | "published", entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(
    withAudit({ sql: "UPDATE banners SET status = ?, updated_at = ? WHERE id = ? AND status <> ?", args: [status, Date.now(), id, status] }, entry),
  );
  return result.rowsAffected > 0;
}

export async function deleteBanner(id: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const result = await db.execute(withAudit({ sql: "DELETE FROM banners WHERE id = ?", args: [id] }, entry));
  return result.rowsAffected > 0;
}
