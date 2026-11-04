"use server";

import { refresh, updateTag } from "next/cache";
import { FORM_KEYS, IMAGE_SEARCH_MODEL, MAX_VIEWS, decodeVector, isValidThresholds, norm, type FormKey } from "@/lib/image-search";
import type { FormState } from "@/lib/types";
import { getDb } from "@/server/db";
import { IMAGE_SEARCH_TAG } from "@/server/image-search";
import {
  deleteProductIndex,
  loadCalibrationIndex,
  saveImageSearchSettings,
  saveProductIndex,
  type CalibrationEntry,
  type CalibrationSummary,
  type ClosedSetStats,
  type FormInput,
} from "@/server/repo/image-search";
import { authorize } from "@/server/auth/session";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Server Action của trang quản trị /admin/tim-bang-anh (YC-AI-05, 06). Trình duyệt của quản trị dựng ảnh và
// trích đặc trưng; máy chủ kiểm tra từng vector, tự gộp góc nhìn rồi lưu.

export type IndexPayload = {
  productId: string;
  model: string;
  // products.model_url mà trình duyệt đã dựng; khác giá trị hiện tại thì từ chối (mô hình vừa được thay).
  sourceUrl: string;
  forms: { form: FormKey; label: string; views: string[] }[];
};

export type IndexResult = FormState & { forms?: { form: FormKey; consistency: number }[] };

// Vector một góc nhìn: đúng số chiều, hữu hạn, đã chuẩn hoá (độ dài ≈ 1).
function readView(base64: unknown): Float32Array | null {
  if (typeof base64 !== "string" || base64.length > 8192) return null;
  let vector: Float32Array;
  try {
    vector = decodeVector(base64);
  } catch {
    return null;
  }
  if (vector.length !== IMAGE_SEARCH_MODEL.dim || !vector.every(Number.isFinite)) return null;
  const length = norm(vector);
  return Math.abs(length - 1) < 0.01 ? vector : null;
}

export async function saveImageIndexAction(payload: IndexPayload): Promise<IndexResult> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!payload || !isId(payload.productId) || payload.model !== IMAGE_SEARCH_MODEL.id) return { message: "Yêu cầu không hợp lệ." };
  const forms = Array.isArray(payload.forms) ? payload.forms : [];
  if (forms.length === 0 || forms.length > FORM_KEYS.length || new Set(forms.map((form) => form?.form)).size !== forms.length) {
    return { message: "Danh sách dạng của mô hình không hợp lệ." };
  }
  const inputs: FormInput[] = [];
  for (const form of forms) {
    if (!FORM_KEYS.includes(form.form) || typeof form.label !== "string" || form.label.length > 60) return { message: "Dạng của mô hình không hợp lệ." };
    if (!Array.isArray(form.views) || form.views.length === 0 || form.views.length > MAX_VIEWS) return { message: "Số góc nhìn không hợp lệ." };
    const views = form.views.map(readView);
    if (views.some((view) => view === null)) return { message: "Vector đặc trưng không hợp lệ." };
    inputs.push({ form: form.form, label: form.label.trim(), views: views as Float32Array[] });
  }

  const db = await getDb();
  const product = (await db.execute({ sql: "SELECT name, model_url FROM products WHERE id = ?", args: [payload.productId] })).rows[0];
  if (!product) return { message: "Không tìm thấy sản phẩm." };
  if (String(product.model_url ?? "") !== payload.sourceUrl) return { message: "Mô hình 3D của sản phẩm vừa thay đổi, hãy lập chỉ mục lại." };

  const saved = await saveProductIndex(
    payload.productId,
    { model: IMAGE_SEARCH_MODEL.id, dim: IMAGE_SEARCH_MODEL.dim, sourceUrl: payload.sourceUrl, forms: inputs },
    audit({ action: "image_search.index", entity: "image_search_index", summary: `Lập chỉ mục tìm bằng ảnh: ${String(product.name)}` }),
  );
  if (!saved) return { message: "Không tìm thấy sản phẩm." };
  updateTag(IMAGE_SEARCH_TAG);
  return { ok: true, message: "Đã lưu chỉ mục.", forms: saved };
}

export async function deleteImageIndexAction(productId: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(productId)) return { message: "Yêu cầu không hợp lệ." };
  const removed = await deleteProductIndex(
    productId,
    IMAGE_SEARCH_MODEL.id,
    audit({ action: "image_search.unindex", entity: "image_search_index", summary: "Xoá chỉ mục tìm bằng ảnh của sản phẩm" }),
  );
  updateTag(IMAGE_SEARCH_TAG);
  refresh();
  return removed ? { ok: true, message: "Đã xoá chỉ mục của sản phẩm." } : { message: "Sản phẩm chưa có chỉ mục." };
}

// Vector đại diện và vector từng góc của mọi sản phẩm đã lập chỉ mục, cho hiệu chỉnh chạy ở trình duyệt.
export async function loadCalibrationAction(): Promise<{ entries: CalibrationEntry[] } | FormState> {
  const user = await authorize("catalog.edit");
  if (!user) return FORBIDDEN;
  return { entries: await loadCalibrationIndex(IMAGE_SEARCH_MODEL.id) };
}

const finite = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

type Rates = CalibrationSummary["select"];

// Kết quả hiệu chỉnh do trình duyệt gửi lên: dựng lại bản sạch chỉ gồm các trường đã biết, đúng miền giá trị;
// sai một trường thì bỏ cả kết quả (null). Không lưu nguyên đối tượng nhận được.
function readRates(value: unknown): Rates | null {
  const x = value as Partial<Rates> | null;
  if (!x || !(["correctAccept", "wrongAccept", "falseReject", "falseAccept"] as const).every((key) => finite(x[key], 0, 1))) return null;
  if (!finite(x.known, 0, 1e6) || !finite(x.unknown, 0, 1e6)) return null;
  return { correctAccept: x.correctAccept!, wrongAccept: x.wrongAccept!, falseReject: x.falseReject!, falseAccept: x.falseAccept!, known: x.known!, unknown: x.unknown! };
}

function readClosedSet(value: unknown): ClosedSetStats | null {
  const x = value as Partial<ClosedSetStats> | null;
  if (!x || !finite(x.queries, 0, 1e6) || !finite(x.recall1, 0, 1) || !finite(x.recall5, 0, 1) || !finite(x.mrr, 0, 1)) return null;
  return { queries: x.queries!, recall1: x.recall1!, recall5: x.recall5!, mrr: x.mrr! };
}

function readCalibration(value: unknown): CalibrationSummary | null {
  const c = value as Partial<CalibrationSummary> | null;
  if (!c || !finite(c.tau, -1, 1) || !finite(c.delta, 0, 2) || !finite(c.farMax, 0, 1)) return null;
  if (!finite(c.products, 0, 1e5) || !finite(c.queriesPerProduct, 0, 1000)) return null;
  const select = readRates(c.select);
  const test = readRates(c.test);
  if (!select || !test) return null;
  const summary: CalibrationSummary = { tau: c.tau!, delta: c.delta!, farMax: c.farMax!, select, test, products: c.products!, queriesPerProduct: c.queriesPerProduct! };
  if (finite(c.seed, 0, 2 ** 32)) summary.seed = c.seed;
  if (c.maxview) {
    const m = c.maxview;
    const mSelect = readRates(m.select);
    const mTest = readRates(m.test);
    if (!mSelect || !mTest || !finite(m.tau, -1, 1) || !finite(m.delta, 0, 2)) return null;
    summary.maxview = { tau: m.tau, delta: m.delta, select: mSelect, test: mTest };
  }
  if (c.closedSet) {
    const mean = readClosedSet(c.closedSet.mean);
    const maxview = readClosedSet(c.closedSet.maxview);
    if (!mean || !maxview) return null;
    summary.closedSet = { mean, maxview };
  }
  return summary;
}

export async function saveThresholdsAction(input: { tau: number; delta: number; calibration: CalibrationSummary | null }): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const thresholds = { tau: Number(input?.tau), delta: Number(input?.delta) };
  if (!isValidThresholds(thresholds) || thresholds.tau < 0) return { message: "τ phải nằm trong [0, 1], δ trong [0, 2]." };
  const raw = input?.calibration ?? null;
  const calibration = raw === null ? null : readCalibration(raw);
  if (raw !== null && !calibration) return { message: "Kết quả hiệu chỉnh không hợp lệ." };
  // Hiệu chỉnh chỉ được ghi kèm đúng cặp ngưỡng nó tìm ra; tự nhập ngưỡng thì bỏ kết quả hiệu chỉnh cũ.
  const calibrated = calibration !== null && calibration.tau === thresholds.tau && calibration.delta === thresholds.delta;
  await saveImageSearchSettings(
    { ...thresholds, model: IMAGE_SEARCH_MODEL.id, source: calibrated ? "calibrated" : "manual", calibration: calibrated ? calibration : null },
    audit({
      action: "image_search.thresholds",
      entity: "site_settings",
      entityId: "image_search",
      summary: `Đặt ngưỡng tìm bằng ảnh τ = ${thresholds.tau}, δ = ${thresholds.delta}${calibrated ? " (hiệu chỉnh)" : ""}`,
    }),
  );
  updateTag(IMAGE_SEARCH_TAG);
  refresh();
  return { ok: true, message: "Đã lưu ngưỡng." };
}
