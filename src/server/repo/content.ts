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

// ---------------------------------------------------------------------------------------------------------
// Menu (YC-CMS-03).

export type NavMenu = "header" | "footer";
export type NavItem = { id: string; menu: NavMenu; label: string; url: string; sortOrder: number; isActive: boolean };

export async function listNavItems(): Promise<NavItem[]> {
  const db = await getDb();
  const result = await db.execute("SELECT * FROM nav_items ORDER BY menu DESC, sort_order, label");
  return result.rows.map((row) => ({
    id: String(row.id),
    menu: row.menu === "footer" ? "footer" : "header",
    label: String(row.label),
    url: String(row.url),
    sortOrder: Number(row.sort_order),
    isActive: Boolean(row.is_active),
  }));
}

export async function saveNavItem(id: string | null, input: Omit<NavItem, "id">, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  const args = [input.menu, input.label, input.url, input.sortOrder, input.isActive];
  if (id) {
    const result = await db.execute(withAudit({ sql: "UPDATE nav_items SET menu = ?, label = ?, url = ?, sort_order = ?, is_active = ? WHERE id = ?", args: [...args, id] }, entry));
    return result.rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    { sql: "INSERT INTO nav_items (menu, label, url, sort_order, is_active, id) VALUES (?, ?, ?, ?, ?, ?)", args: [...args, newIdValue] },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

export async function deleteNavItem(id: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  return (await db.execute(withAudit({ sql: "DELETE FROM nav_items WHERE id = ?", args: [id] }, entry))).rowsAffected > 0;
}

// Đường dẫn cố định của cửa hàng mà menu được trỏ tới.
const FIXED_PATHS = ["/", "/san-pham", "/gio-hang", "/thanh-toan", "/tai-khoan", "/tra-cuu-don-hang", "/dang-nhap", "/dang-ky"];

// YC-CMS-03: liên kết nội bộ phải trỏ tới trang có thật (đường dẫn cố định, trang lọc sản phẩm, sản phẩm đã
// xuất bản). Liên kết ngoài (https://) không kiểm tra ở đây.
export async function internalLinkExists(url: string): Promise<boolean> {
  const [path, query] = url.split("?");
  if (FIXED_PATHS.includes(path)) return path === "/san-pham" || !query;
  const db = await getDb();
  const page = /^\/trang\/([a-z0-9-]+)$/.exec(path);
  if (page) {
    return (await db.execute({ sql: "SELECT 1 FROM pages WHERE slug = ? AND status = 'published'", args: [page[1]] })).rows.length > 0;
  }
  const product = /^\/san-pham\/([a-z0-9-]+)$/.exec(path);
  if (product) {
    return (await db.execute({ sql: "SELECT 1 FROM products WHERE slug = ? AND status = 'published'", args: [product[1]] })).rows.length > 0;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------
// Cài đặt hiển thị (YC-CMS-05, 06). Lưu JSON theo khoá trong site_settings.

export type ContactSettings = { phone: string; email: string; address: string; hours: string };
export type AnnouncementSettings = { enabled: boolean; text: string; linkUrl: string; startsAt: number | null; endsAt: number | null };
export type PolicySettings = { returnDays: number; warrantyMonths: number };
export type SiteSettings = { contact: ContactSettings | null; announcement: AnnouncementSettings | null; policy: PolicySettings | null };
export type SettingKey = keyof SiteSettings;

export async function getSettings(): Promise<SiteSettings> {
  const db = await getDb();
  const result = await db.execute("SELECT key, value FROM site_settings");
  const map = Object.fromEntries(result.rows.map((row) => [String(row.key), JSON.parse(String(row.value)) as unknown]));
  return {
    contact: (map.contact as ContactSettings | undefined) ?? null,
    announcement: (map.announcement as AnnouncementSettings | undefined) ?? null,
    policy: (map.policy as PolicySettings | undefined) ?? null,
  };
}

export async function saveSetting<K extends SettingKey>(key: K, value: NonNullable<SiteSettings[K]>, entry: AuditEntry): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.batch([
    {
      sql: `INSERT INTO site_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [key, JSON.stringify(value), entry.actor.id, now],
    },
    auditStatement({ ...entry, entityId: key }),
  ]);
}

// Thanh thông báo đang hiệu lực, so giờ bằng đồng hồ CSDL.
export async function activeAnnouncement(): Promise<AnnouncementSettings | null> {
  const db = await getDb();
  const result = await db.execute(`SELECT value, ${NOW} AS now FROM site_settings WHERE key = 'announcement'`);
  const row = result.rows[0];
  if (!row) return null;
  const value = JSON.parse(String(row.value)) as AnnouncementSettings;
  const now = Number(row.now);
  const live = value.enabled && value.text && (value.startsAt === null || value.startsAt <= now) && (value.endsAt === null || value.endsAt > now);
  return live ? value : null;
}

// ---------------------------------------------------------------------------------------------------------
// Trang thông tin (YC-CMS-04). Nội dung là văn bản thuần (Q19): không lưu, không hiện HTML.

export type InfoPage = {
  id: string;
  slug: string;
  title: string;
  body: string;
  metaDescription: string;
  status: "draft" | "published";
  publishedAt: number | null;
  updatedAt: number;
};
export type PageRevision = { id: number; title: string; body: string; authorName: string | null; createdAt: number };

function toPage(row: Row): InfoPage {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    body: String(row.body),
    metaDescription: String(row.meta_description),
    status: row.status === "published" ? "published" : "draft",
    publishedAt: num(row.published_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function listPages(): Promise<InfoPage[]> {
  const db = await getDb();
  return (await db.execute("SELECT * FROM pages ORDER BY title")).rows.map(toPage);
}

export async function findPublishedPage(slug: string): Promise<InfoPage | null> {
  const db = await getDb();
  const row = (await db.execute({ sql: "SELECT * FROM pages WHERE slug = ? AND status = 'published'", args: [slug] })).rows[0];
  return row ? toPage(row) : null;
}

export async function listPageRevisions(pageId: string): Promise<PageRevision[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT r.*, u.name AS author FROM page_revisions r LEFT JOIN users u ON u.id = r.created_by WHERE r.page_id = ? ORDER BY r.id DESC LIMIT 30",
    args: [pageId],
  });
  return result.rows.map((row) => ({ id: Number(row.id), title: String(row.title), body: String(row.body), authorName: row.author === null ? null : String(row.author), createdAt: Number(row.created_at) }));
}

// Ném lỗi ràng buộc khi trùng slug. Sửa trang đang xuất bản thì nội dung mới hiện ngay và được lưu phiên bản.
export async function savePage(id: string | null, input: Pick<InfoPage, "slug" | "title" | "body" | "metaDescription">, entry: AuditEntry): Promise<string | null> {
  const db = await getDb();
  const now = Date.now();
  const args = [input.slug, input.title, input.body, input.metaDescription];
  if (id) {
    const results = await db.batch([
      withAudit({ sql: "UPDATE pages SET slug = ?, title = ?, body = ?, meta_description = ?, updated_at = ? WHERE id = ?", args: [...args, now, id] }, entry),
      {
        sql: "INSERT INTO page_revisions (page_id, title, body, created_by, created_at) SELECT id, title, body, ?, ? FROM pages WHERE id = ? AND status = 'published'",
        args: [entry.actor.id, now, id],
      },
    ]);
    return results[0].rowsAffected > 0 ? id : null;
  }
  const newIdValue = newId();
  await db.batch([
    { sql: "INSERT INTO pages (slug, title, body, meta_description, id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", args: [...args, newIdValue, now, now] },
    auditStatement({ ...entry, entityId: newIdValue }),
  ]);
  return newIdValue;
}

// Xuất bản thêm một phiên bản (người, thời điểm); gỡ xuống thì về nháp.
export async function setPageStatus(id: string, status: "draft" | "published", entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const results = await db.batch([
    withAudit(
      {
        sql: "UPDATE pages SET status = ?, published_at = CASE WHEN ? = 'published' THEN ?::bigint ELSE published_at END, updated_at = ? WHERE id = ? AND status <> ?",
        args: [status, status, now, now, id, status],
      },
      entry,
    ),
    {
      sql: "INSERT INTO page_revisions (page_id, title, body, created_by, created_at) SELECT id, title, body, ?, ? FROM pages WHERE id = ? AND status = 'published' AND ? = 'published'",
      args: [entry.actor.id, now, id, status],
    },
  ]);
  return results[0].rowsAffected > 0;
}

// Khôi phục tiêu đề, nội dung của một phiên bản cũ (giữ nguyên trạng thái trang).
export async function restorePageRevision(pageId: string, revisionId: number, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const now = Date.now();
  const results = await db.batch([
    withAudit(
      {
        // Truy vấn con thay cho UPDATE ... FROM: withAudit thêm RETURNING id, hai bảng cùng có cột id sẽ mơ hồ.
        sql: `UPDATE pages SET
                title = (SELECT title FROM page_revisions WHERE id = ? AND page_id = pages.id),
                body = (SELECT body FROM page_revisions WHERE id = ? AND page_id = pages.id),
                updated_at = ?
              WHERE id = ? AND EXISTS (SELECT 1 FROM page_revisions WHERE id = ? AND page_id = pages.id)`,
        args: [revisionId, revisionId, now, pageId, revisionId],
      },
      entry,
    ),
    {
      sql: "INSERT INTO page_revisions (page_id, title, body, created_by, created_at) SELECT id, title, body, ?, ? FROM pages WHERE id = ? AND status = 'published'",
      args: [entry.actor.id, now, pageId],
    },
  ]);
  return results[0].rowsAffected > 0;
}
