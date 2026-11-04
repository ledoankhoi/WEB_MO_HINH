import "server-only";
import {
  DEFAULT_THRESHOLDS,
  FORM_KEYS,
  bytesToVectors,
  encodeVector,
  isValidThresholds,
  poolViews,
  vectorsToBytes,
  type CalibrationResult,
  type DecisionReason,
  type FormKey,
  type Thresholds,
} from "@/lib/image-search";
import type { ProductSummary } from "@/lib/types";
import { getDb, type Row } from "../db";
import { auditStatement, type AuditEntry } from "./audit";
import { SUMMARY_COLUMNS, toSummary } from "./products";

// Tìm kiếm bằng ảnh (docs/chuan/08-tich-hop-ai.md): chỉ mục vector theo sản phẩm, ngưỡng từ chối và nhật ký.
// Chỉ mục lập ở trình duyệt của quản trị (dựng ảnh 3D, trích đặc trưng); máy chủ kiểm tra, gộp góc nhìn và lưu.

const NOW = "(extract(epoch FROM now()) * 1000)::bigint";
const SETTING_KEY = "image_search";

const asBytes = (value: unknown): Uint8Array => (value instanceof Uint8Array ? value : new Uint8Array(0));

// ---------------------------------------------------------------------------------------------------------
// Ngưỡng
// ---------------------------------------------------------------------------------------------------------

// Kết quả hiệu chỉnh lần gần nhất (thống kê, không gồm từng mẫu) để trang quản trị hiển thị và luận văn trích.
// Đánh giá tập đóng (trước khi áp ngưỡng) trên tập kiểm tra.
export type ClosedSetStats = { queries: number; recall1: number; recall5: number; mrr: number };

export type CalibrationSummary = CalibrationResult & {
  products: number;
  queriesPerProduct: number;
  seed?: number;
  // So sánh hai cách gộp góc nhìn trên cùng dữ liệu (đang dùng trung bình, xem docs/chuan/08 mục 5).
  maxview?: { select: CalibrationResult["select"]; test: CalibrationResult["test"]; tau: number; delta: number } | null;
  closedSet?: { mean: ClosedSetStats; maxview: ClosedSetStats } | null;
};

export type ImageSearchSettings = Thresholds & {
  // Mô hình mà ngưỡng được chọn cho. Khác mô hình đang dùng thì quay về ngưỡng mặc định.
  model: string | null;
  // "calibrated": chọn bằng hiệu chỉnh, "manual": quản trị tự nhập, "default": chưa đặt.
  source: "calibrated" | "manual" | "default";
  calibration: CalibrationSummary | null;
  updatedAt: number | null;
};

export async function getImageSearchSettings(model: string): Promise<ImageSearchSettings> {
  const db = await getDb();
  const result = await db.execute({ sql: "SELECT value, updated_at FROM site_settings WHERE key = ?", args: [SETTING_KEY] });
  const fallback: ImageSearchSettings = { ...DEFAULT_THRESHOLDS, model: null, source: "default", calibration: null, updatedAt: null };
  const row = result.rows[0];
  if (!row) return fallback;
  try {
    const value = JSON.parse(String(row.value)) as Partial<ImageSearchSettings>;
    const thresholds = { tau: Number(value.tau), delta: Number(value.delta) };
    if (value.model !== model || !isValidThresholds(thresholds)) return fallback;
    return {
      ...thresholds,
      model: value.model,
      source: value.source === "calibrated" ? "calibrated" : "manual",
      calibration: value.calibration ?? null,
      updatedAt: Number(row.updated_at),
    };
  } catch {
    return fallback;
  }
}

export async function saveImageSearchSettings(
  value: Thresholds & { model: string; source: "calibrated" | "manual"; calibration: CalibrationSummary | null },
  entry: AuditEntry,
): Promise<void> {
  const db = await getDb();
  await db.batch([
    {
      sql: `INSERT INTO site_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      args: [SETTING_KEY, JSON.stringify(value), entry.actor.id, Date.now()],
    },
    auditStatement(entry),
  ]);
}

// ---------------------------------------------------------------------------------------------------------
// Chỉ mục
// ---------------------------------------------------------------------------------------------------------

export type FormInput = { form: FormKey; label: string; views: Float32Array[] };

// Lưu chỉ mục của một sản phẩm (thay toàn bộ dòng cũ của cùng mô hình). Vector từng góc phải đã chuẩn hoá;
// vector đại diện và độ nhất quán do máy chủ tính lại từ đó. Trả về null khi sản phẩm không còn.
export async function saveProductIndex(
  productId: string,
  input: { model: string; dim: number; sourceUrl: string; forms: FormInput[] },
  entry: AuditEntry,
): Promise<{ form: FormKey; consistency: number }[] | null> {
  const db = await getDb();
  const exists = await db.execute({ sql: "SELECT 1 FROM products WHERE id = ?", args: [productId] });
  if (exists.rows.length === 0) return null;
  const now = Date.now();
  const pooled = input.forms.map((form) => ({ ...form, ...poolViews(form.views) }));
  await db.batch([
    { sql: "DELETE FROM image_search_index WHERE product_id = ? AND model = ?", args: [productId, input.model] },
    ...pooled.map((form) => ({
      sql: `INSERT INTO image_search_index (product_id, model, form, form_label, dim, views, embedding, view_embeddings, consistency, source_url, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        productId,
        input.model,
        form.form,
        form.label,
        input.dim,
        form.views.length,
        vectorsToBytes([form.embedding]),
        vectorsToBytes(form.views),
        form.consistency,
        input.sourceUrl,
        entry.actor.id,
        now,
      ],
    })),
    auditStatement({
      ...entry,
      entityId: productId,
      detail: { model: input.model, forms: pooled.map((form) => ({ form: form.form, views: form.views.length, consistency: Number(form.consistency.toFixed(4)) })) },
    }),
  ]);
  return pooled.map((form) => ({ form: form.form, consistency: form.consistency }));
}

export async function deleteProductIndex(productId: string, model: string, entry: AuditEntry): Promise<boolean> {
  const db = await getDb();
  const [deleted] = await db.batch([
    { sql: "DELETE FROM image_search_index WHERE product_id = ? AND model = ?", args: [productId, model] },
    auditStatement({ ...entry, entityId: productId }),
  ]);
  return deleted.rowsAffected > 0;
}

export type IndexedFormStatus = { form: FormKey; label: string; views: number; consistency: number; sourceUrl: string; createdAt: number };

export type IndexStatusRow = {
  productId: string;
  name: string;
  slug: string;
  status: string;
  modelUrl: string | null;
  image: string | null;
  forms: IndexedFormStatus[];
};

// Mọi sản phẩm (kể cả nháp) kèm tình trạng chỉ mục của mô hình đang dùng; `otherModels` đếm dòng của mô hình cũ.
export async function listIndexStatus(model: string): Promise<{ products: IndexStatusRow[]; otherModels: { model: string; rows: number }[] }> {
  const db = await getDb();
  const [products, forms, others] = await db.batch([
    "SELECT id, name, slug, status, model_url, image FROM products WHERE status <> 'archived' ORDER BY lower(name), id",
    {
      sql: `SELECT product_id, form, form_label, views, consistency, source_url, created_at FROM image_search_index
            WHERE model = ? ORDER BY product_id, form`,
      args: [model],
    },
    { sql: "SELECT model, COUNT(*) AS n FROM image_search_index WHERE model <> ? GROUP BY model ORDER BY model", args: [model] },
  ]);
  const byProduct = new Map<string, IndexedFormStatus[]>();
  for (const row of forms.rows) {
    const list = byProduct.get(String(row.product_id)) ?? [];
    list.push({
      form: String(row.form) as FormKey,
      label: String(row.form_label),
      views: Number(row.views),
      consistency: Number(row.consistency),
      sourceUrl: String(row.source_url),
      createdAt: Number(row.created_at),
    });
    byProduct.set(String(row.product_id), list);
  }
  return {
    products: products.rows.map((row) => ({
      productId: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      status: String(row.status),
      modelUrl: row.model_url === null ? null : String(row.model_url),
      image: row.image === null ? null : String(row.image),
      forms: byProduct.get(String(row.id)) ?? [],
    })),
    otherModels: others.rows.map((row) => ({ model: String(row.model), rows: Number(row.n) })),
  };
}

// Chỉ mục để tìm kiếm: sản phẩm đang bán đã có vector của mô hình này, vector đại diện dạng base64.
export type SearchIndexEntry = { productId: string; product: ProductSummary; forms: { form: FormKey; label: string; embedding: string }[] };

export async function loadSearchIndex(model: string): Promise<SearchIndexEntry[]> {
  const db = await getDb();
  const [products, forms] = await db.batch([
    {
      sql: `SELECT ${SUMMARY_COLUMNS} FROM product_list
            WHERE is_active AND id IN (SELECT product_id FROM image_search_index WHERE model = ?) ORDER BY id`,
      args: [model],
    },
    { sql: "SELECT product_id, form, form_label, dim, embedding FROM image_search_index WHERE model = ? ORDER BY product_id, form", args: [model] },
  ]);
  const byProduct = new Map<string, SearchIndexEntry["forms"]>();
  for (const row of forms.rows) {
    const [vector] = bytesToVectors(asBytes(row.embedding), Number(row.dim));
    if (!vector) continue;
    const list = byProduct.get(String(row.product_id)) ?? [];
    list.push({ form: String(row.form) as FormKey, label: String(row.form_label), embedding: encodeVector(vector) });
    byProduct.set(String(row.product_id), list);
  }
  return products.rows.map((row: Row) => ({ productId: String(row.id), product: toSummary(row), forms: byProduct.get(String(row.id)) ?? [] }));
}

// Số sản phẩm khách tìm được bằng ảnh (đang bán, đã có vector của mô hình này). Không đọc vector.
export async function countSearchableProducts(model: string): Promise<number> {
  const db = await getDb();
  const result = await db.execute({
    sql: "SELECT COUNT(*) AS n FROM product_list WHERE is_active AND id IN (SELECT product_id FROM image_search_index WHERE model = ?)",
    args: [model],
  });
  return Number(result.rows[0]?.n ?? 0);
}

// Cho hiệu chỉnh ở trang quản trị: vector đại diện và vector từng góc (base64) của mọi sản phẩm đang bán.
export type CalibrationEntry = { productId: string; name: string; modelUrl: string | null; forms: { form: FormKey; label: string; embedding: string; views: string[] }[] };

export async function loadCalibrationIndex(model: string): Promise<CalibrationEntry[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT i.product_id, p.name, p.model_url, i.form, i.form_label, i.dim, i.embedding, i.view_embeddings
          FROM image_search_index i JOIN products p ON p.id = i.product_id
          WHERE i.model = ? AND p.status = 'published' ORDER BY i.product_id, i.form`,
    args: [model],
  });
  const entries = new Map<string, CalibrationEntry>();
  for (const row of result.rows) {
    const id = String(row.product_id);
    const dim = Number(row.dim);
    const entry = entries.get(id) ?? { productId: id, name: String(row.name), modelUrl: row.model_url === null ? null : String(row.model_url), forms: [] };
    const [embedding] = bytesToVectors(asBytes(row.embedding), dim);
    entry.forms.push({
      form: String(row.form) as FormKey,
      label: String(row.form_label),
      embedding: encodeVector(embedding),
      views: bytesToVectors(asBytes(row.view_embeddings), dim).map(encodeVector),
    });
    entries.set(id, entry);
  }
  return [...entries.values()];
}

export const isFormKey = (value: unknown): value is FormKey => FORM_KEYS.includes(value as FormKey);

// ---------------------------------------------------------------------------------------------------------
// Nhật ký tìm kiếm
// ---------------------------------------------------------------------------------------------------------

export type SearchLogInput = {
  model: string;
  topProductId: string | null;
  s1: number;
  s2: number;
  accepted: boolean;
  reason: DecisionReason;
  thresholds: Thresholds;
  candidates: number;
  clientMs: number | null;
};

export async function logImageSearch(entry: SearchLogInput): Promise<void> {
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO image_search_logs (model, top_product_id, top_score, second_score, accepted, reason, tau, delta, candidates, client_ms, created_at)
          VALUES (?, (SELECT id FROM products WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entry.model,
      entry.topProductId,
      entry.s1,
      entry.s2,
      entry.accepted,
      entry.reason,
      entry.thresholds.tau,
      entry.thresholds.delta,
      entry.candidates,
      entry.clientMs,
      Date.now(),
    ],
  });
}

export type SearchLogRow = {
  id: number;
  createdAt: number;
  productId: string | null;
  productName: string | null;
  s1: number;
  s2: number;
  accepted: boolean;
  reason: DecisionReason;
  clientMs: number | null;
};

export type SearchStats = { total: number; accepted: number; byReason: Record<DecisionReason, number>; medianClientMs: number | null; recent: SearchLogRow[] };

// Thống kê `days` ngày gần nhất (đồng hồ CSDL) và các lượt tìm mới nhất.
export async function imageSearchStats(days = 30, recentLimit = 20): Promise<SearchStats> {
  const db = await getDb();
  const since = `${NOW} - ${Math.max(1, Math.floor(days))} * 86400000::bigint`;
  const [summary, reasons, recent] = await db.batch([
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE accepted) AS accepted,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY client_ms) AS median_ms
     FROM image_search_logs WHERE created_at >= ${since}`,
    `SELECT reason, COUNT(*) AS n FROM image_search_logs WHERE created_at >= ${since} GROUP BY reason`,
    {
      sql: `SELECT l.id, l.created_at, l.top_product_id, p.name, l.top_score, l.second_score, l.accepted, l.reason, l.client_ms
            FROM image_search_logs l LEFT JOIN products p ON p.id = l.top_product_id ORDER BY l.created_at DESC, l.id DESC LIMIT ?`,
      args: [recentLimit],
    },
  ]);
  const byReason: Record<DecisionReason, number> = { match: 0, "low-score": 0, ambiguous: 0, empty: 0 };
  for (const row of reasons.rows) if (String(row.reason) in byReason) byReason[String(row.reason) as DecisionReason] = Number(row.n);
  const median = summary.rows[0].median_ms;
  return {
    total: Number(summary.rows[0].total),
    accepted: Number(summary.rows[0].accepted),
    byReason,
    medianClientMs: median === null || median === undefined ? null : Math.round(Number(median)),
    recent: recent.rows.map((row) => ({
      id: Number(row.id),
      createdAt: Number(row.created_at),
      productId: row.top_product_id === null ? null : String(row.top_product_id),
      productName: row.name === null || row.name === undefined ? null : String(row.name),
      s1: Number(row.top_score),
      s2: Number(row.second_score),
      accepted: Boolean(row.accepted),
      reason: String(row.reason) as DecisionReason,
      clientMs: row.client_ms === null ? null : Number(row.client_ms),
    })),
  };
}
