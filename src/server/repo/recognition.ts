import "server-only";
import type { RecognitionLabel, RecognitionLevel } from "@/lib/recognition";
import type { ModelInput, ModelRecord, RobotRecord } from "@/lib/recognition-import";
import type { ProductSummary } from "@/lib/types";
import { getDb, type InStatement, type Row } from "../db";
import { newId } from "../ids";
import { auditStatement, withAudit, writeAudit, type AuditEntry } from "./audit";
import { summaryColumns, toSummary } from "./products";

// Nhận dạng robot từ ảnh (docs/nhan-dang-robot/00-ke-hoach.md, B10–B11; migration nd_01_nhan_dang_robot).
// Robot nhập từ robots.json của B1; mô hình nhập từ model-card.json + labels.json của B9 (kiểm tra ở src/lib/recognition-import.ts).

export type Robot = Omit<RobotRecord, never> & { id: string; productIds: string[] };

export type RecognitionModelSummary = {
  id: string;
  label: string;
  arch: string;
  variant: string;
  mb: number;
  classes: number;
  datasetVersion: string;
  metrics: Record<string, unknown>;
  isActive: boolean;
  isSmoke: boolean;
  createdAt: number;
};

// Phần trình duyệt cần để chạy mô hình và máy chủ cần để kiểm tra kết quả (không có metrics, created_by).
export type ActiveRecognitionModel = {
  id: string;
  label: string;
  arch: string;
  files: string[];
  mb: number;
  input: ModelInput;
  temperature: number;
  thresholds: [number, number, number];
  labels: RecognitionLabel[];
};

export type RecognitionStats = { total: number; byLevel: Record<RecognitionLevel, number>; avgTopProb: number | null; medianClientMs: number | null };

function parse<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

const ROBOT_COLUMNS = [
  "id", "slug", "name", "character", "franchise", "franchise_label", "series", "faction", "alt_mode", "description", "aliases", "image", "source_url",
  "store_products", "created_at", "updated_at",
] as const;

function toRobot(row: Row): Robot {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    character: String(row.character),
    franchise: String(row.franchise),
    franchiseLabel: String(row.franchise_label),
    series: String(row.series),
    faction: String(row.faction),
    altMode: String(row.alt_mode),
    description: String(row.description),
    image: row.image === null ? null : String(row.image),
    sourceUrl: row.source_url === null ? null : String(row.source_url),
    aliases: parse<string[]>(row.aliases, []),
    storeProducts: parse<string[]>(row.store_products, []),
    productIds: Array.isArray(row.product_ids) ? row.product_ids.map(String) : [],
  };
}

// Thêm robot mới, cập nhật robot đã có (theo slug). Không xoá robot vắng mặt trong file: mô hình cũ và nhật ký có thể còn trỏ tới.
// Gom thành vài câu INSERT nhiều dòng (CSDL ở xa, mỗi lượt đi về ~100 ms), chạy trong một giao dịch cùng dòng nhật ký.
export async function upsertRobots(records: RobotRecord[], entry: AuditEntry): Promise<{ created: number; updated: number }> {
  const db = await getDb();
  const now = Date.now();
  const statements: InStatement[] = [];
  const CHUNK = 200;
  for (let start = 0; start < records.length; start += CHUNK) {
    const chunk = records.slice(start, start + CHUNK);
    const placeholders = chunk.map(() => `(${ROBOT_COLUMNS.map(() => "?").join(", ")})`).join(", ");
    const args = chunk.flatMap((r) => [
      newId(), r.slug, r.name, r.character, r.franchise, r.franchiseLabel, r.series, r.faction, r.altMode, r.description, JSON.stringify(r.aliases),
      r.image, r.sourceUrl, JSON.stringify(r.storeProducts), now, now,
    ]);
    const updates = ROBOT_COLUMNS.filter((c) => !["id", "slug", "created_at"].includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    statements.push({
      sql: `INSERT INTO robots (${ROBOT_COLUMNS.join(", ")}) VALUES ${placeholders} ON CONFLICT (slug) DO UPDATE SET ${updates} RETURNING (xmax = 0) AS inserted`,
      args,
    });
  }
  const results = await db.batch([...statements, auditStatement({ ...entry, detail: { robots: records.length } })]);
  const inserted = results.slice(0, statements.length).reduce((sum, r) => sum + r.rows.filter((row) => row.inserted === true || row.inserted === "t").length, 0);
  return { created: inserted, updated: records.length - inserted };
}

export async function listRobots(): Promise<Robot[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT r.*, COALESCE(array_agg(rp.product_id ORDER BY rp.product_id) FILTER (WHERE rp.product_id IS NOT NULL), '{}') AS product_ids
     FROM robots r LEFT JOIN robot_products rp ON rp.robot_id = r.id GROUP BY r.id ORDER BY r.franchise, lower(r.name), r.id`,
  );
  return result.rows.map(toRobot);
}

export async function listRobotSlugs(): Promise<Set<string>> {
  const db = await getDb();
  return new Set((await db.execute("SELECT slug FROM robots")).rows.map((row) => String(row.slug)));
}

export async function findRobotsBySlugs(slugs: readonly string[]): Promise<Robot[]> {
  if (slugs.length === 0) return [];
  const db = await getDb();
  const result = await db.execute({ sql: `SELECT r.*, '{}'::text[] AS product_ids FROM robots r WHERE r.slug IN (${slugs.map(() => "?").join(", ")})`, args: [...slugs] });
  return result.rows.map(toRobot);
}

// Sản phẩm đang bán gắn với từng robot (thẻ "Cửa hàng có bán" ở trang kết quả).
export async function listProductsForRobots(robotIds: readonly string[], limit = 8): Promise<Map<string, ProductSummary[]>> {
  const out = new Map<string, ProductSummary[]>();
  if (robotIds.length === 0) return out;
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT ${summaryColumns("p")}, rp.robot_id FROM product_list p JOIN robot_products rp ON rp.product_id = p.id
          WHERE p.is_active AND rp.robot_id IN (${robotIds.map(() => "?").join(", ")}) ORDER BY p.is_featured DESC, p.created_at DESC, p.id`,
    args: [...robotIds],
  });
  for (const row of result.rows) {
    const list = out.get(String(row.robot_id)) ?? [];
    if (list.length < limit) list.push(toSummary(row));
    out.set(String(row.robot_id), list);
  }
  return out;
}

// Ghép theo gợi ý của B1 (robots.store_products là slug sản phẩm). Không ghép đè hay gỡ cặp đã có.
export async function applySuggestedLinks(entry: AuditEntry): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: `INSERT INTO robot_products (robot_id, product_id, created_at)
          SELECT r.id, p.id, ? FROM robots r CROSS JOIN LATERAL json_array_elements_text(r.store_products::json) AS s(slug)
          JOIN products p ON p.slug = s.slug
          ON CONFLICT DO NOTHING`,
    args: [Date.now()],
  });
  if (result.rowsAffected > 0) await writeAudit({ ...entry, detail: { links: result.rowsAffected } });
  return result.rowsAffected;
}

// Ghép hoặc gỡ một cặp robot–sản phẩm. Trả false khi robot hoặc sản phẩm không tồn tại (hoặc cặp đã ở trạng thái đó).
export async function setRobotProduct(robotId: string, productId: string, linked: boolean, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const statement: InStatement = linked
    ? {
        sql: `INSERT INTO robot_products (robot_id, product_id, created_at)
              SELECT r.id, p.id, ? FROM robots r, products p WHERE r.id = ? AND p.id = ? ON CONFLICT DO NOTHING`,
        args: [Date.now(), robotId, productId],
      }
    : { sql: "DELETE FROM robot_products WHERE robot_id = ? AND product_id = ?", args: [robotId, productId] };
  const [result] = await db.batch([statement]);
  if (result.rowsAffected > 0) await writeAudit({ ...entry, entityId: robotId });
  return result.rowsAffected > 0;
}

export async function listProductChoices(): Promise<{ id: string; slug: string; name: string }[]> {
  const db = await getDb();
  return (await db.execute("SELECT id, slug, name FROM products ORDER BY lower(name), id")).rows.map((row) => ({ id: String(row.id), slug: String(row.slug), name: String(row.name) }));
}

// ---------- mô hình ----------

// Trả false khi đã có mô hình cùng mã (mỗi lần xuất ở B9 có mã riêng; không ghi đè để số liệu cũ còn nguyên).
export async function saveModel(model: ModelRecord, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const [result] = await db.batch([
    {
      sql: `INSERT INTO recognition_models (id, label, arch, variant, files, mb, input, temperature, thresholds, labels, metrics, dataset_version, is_smoke,
              created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
      args: [
        model.id, model.label, model.arch, model.variant, JSON.stringify(model.files), model.mb, JSON.stringify(model.input), model.temperature,
        JSON.stringify(model.thresholds), JSON.stringify(model.labels), JSON.stringify(model.metrics), model.datasetVersion, model.smoke, entry.actor.id, Date.now(),
      ],
    },
  ]);
  if (result.rowsAffected > 0) await writeAudit({ ...entry, entityId: model.id });
  return result.rowsAffected > 0;
}

export async function listModels(): Promise<RecognitionModelSummary[]> {
  const db = await getDb();
  const result = await db.execute(
    `SELECT id, label, arch, variant, mb, dataset_version, metrics, is_active, is_smoke, created_at, json_array_length(labels::json) AS classes
     FROM recognition_models ORDER BY is_active DESC, created_at DESC, id`,
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    arch: String(row.arch),
    variant: String(row.variant),
    mb: Number(row.mb),
    classes: Number(row.classes),
    datasetVersion: String(row.dataset_version),
    metrics: parse<Record<string, unknown>>(row.metrics, {}),
    isActive: Boolean(row.is_active),
    isSmoke: Boolean(row.is_smoke),
    createdAt: Number(row.created_at),
  }));
}

// Bật một mô hình (mô hình đang bật tự tắt, cùng giao dịch) hoặc tắt hết (`id` null). Trả false khi không có mô hình đó.
export async function setActiveModel(id: string | null, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const statements: InStatement[] = [{ sql: "UPDATE recognition_models SET is_active = false WHERE is_active AND id IS DISTINCT FROM ?", args: [id] }];
  if (id) statements.push(withAudit({ sql: "UPDATE recognition_models SET is_active = true WHERE id = ? AND NOT is_active", args: [id] }, entry));
  const results = await db.batch(statements);
  if (!id) {
    if (results[0].rowsAffected > 0) await writeAudit(entry);
    return true;
  }
  if (results[1].rowsAffected > 0) return true;
  return (await db.execute({ sql: "SELECT 1 FROM recognition_models WHERE id = ? AND is_active", args: [id] })).rows.length > 0;
}

export async function deleteModel(id: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  return (await db.execute(withAudit({ sql: "DELETE FROM recognition_models WHERE id = ? AND NOT is_active", args: [id] }, entry))).rowsAffected > 0;
}

export async function findActiveModel(): Promise<ActiveRecognitionModel | null> {
  const db = await getDb();
  const row = (await db.execute("SELECT id, label, arch, files, mb, input, temperature, thresholds, labels FROM recognition_models WHERE is_active LIMIT 1")).rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    label: String(row.label),
    arch: String(row.arch),
    files: parse<string[]>(row.files, []),
    mb: Number(row.mb),
    input: parse<ModelInput>(row.input, { size: 224, resize: 256, mean: [0, 0, 0], std: [1, 1, 1] }),
    temperature: Number(row.temperature),
    thresholds: parse<[number, number, number]>(row.thresholds, [1.01, 1.01, 1.01]),
    labels: parse<RecognitionLabel[]>(row.labels, []),
  };
}

// ---------- nhật ký lượt nhận dạng (không có ảnh, không có người dùng) ----------

export async function logRecognition(log: { model: string; topRobotSlug: string | null; topProb: number; level: RecognitionLevel; clientMs: number | null }): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO recognition_logs (model, top_robot_id, top_prob, level, client_ms, created_at)
          VALUES (?, (SELECT id FROM robots WHERE slug = ?), ?, ?, ?, ?)`,
    args: [log.model, log.topRobotSlug, log.topProb, log.level, log.clientMs, Date.now()],
  });
}

// Thống kê `days` ngày gần nhất theo đồng hồ CSDL (gọi được lúc dựng trang).
export async function recognitionStats(days = 30): Promise<RecognitionStats> {
  const db = await getDb();
  const row = (
    await db.execute({
      sql: `SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE level = 'class') AS l_class, COUNT(*) FILTER (WHERE level = 'character') AS l_character,
                   COUNT(*) FILTER (WHERE level = 'franchise') AS l_franchise, COUNT(*) FILTER (WHERE level = 'none') AS l_none,
                   AVG(top_prob) AS avg_prob, percentile_cont(0.5) WITHIN GROUP (ORDER BY client_ms) AS median_ms
            FROM recognition_logs WHERE created_at >= (extract(epoch FROM now()) * 1000)::bigint - ?::bigint * 86400000`,
      args: [days],
    })
  ).rows[0];
  const n = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    total: Number(row?.total ?? 0),
    byLevel: { class: Number(row?.l_class ?? 0), character: Number(row?.l_character ?? 0), franchise: Number(row?.l_franchise ?? 0), none: Number(row?.l_none ?? 0) },
    avgTopProb: n(row?.avg_prob),
    medianClientMs: n(row?.median_ms),
  };
}
