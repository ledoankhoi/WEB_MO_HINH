import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { decide, decodeVector, rankProducts, type Decision, type FormKey, type IndexedForm } from "@/lib/image-search";
import type { ProductSummary } from "@/lib/types";
import { PRODUCTS_TAG } from "./catalog";
import { countSearchableProducts, getImageSearchSettings, loadSearchIndex, type SearchIndexEntry } from "./repo/image-search";

// Chỉ mục và ngưỡng đọc qua cache; lập chỉ mục hoặc đổi ngưỡng xong thì gọi updateTag(IMAGE_SEARCH_TAG).
// Chỉ mục gắn thêm PRODUCTS_TAG vì kèm giá, tồn và trạng thái của sản phẩm.
export const IMAGE_SEARCH_TAG = "image-search";

export async function getSearchIndex(model: string): Promise<SearchIndexEntry[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(IMAGE_SEARCH_TAG, PRODUCTS_TAG);
  return loadSearchIndex(model);
}

export async function getSearchThresholds(model: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(IMAGE_SEARCH_TAG);
  const { tau, delta, source } = await getImageSearchSettings(model);
  return { tau, delta, source };
}

// Tình trạng cho trang tìm kiếm của khách và nút máy ảnh ở đầu trang: có bao nhiêu sản phẩm tìm được bằng
// ảnh (0 = chưa bật). Lỗi CSDL thì coi như chưa bật, để đầu trang của mọi trang không lỗi theo.
export async function getImageSearchStatus(model: string): Promise<{ products: number }> {
  "use cache";
  cacheTag(IMAGE_SEARCH_TAG, PRODUCTS_TAG);
  try {
    const products = await countSearchableProducts(model);
    cacheLife("hours");
    return { products };
  } catch (cause) {
    console.error("[robotica] Không đọc được chỉ mục tìm bằng ảnh:", cause instanceof Error ? cause.message : cause);
    // Giữ kết quả lỗi ngắn để sớm thử lại ("seconds" thì không được nằm trong khung tĩnh của trang).
    cacheLife("minutes");
    return { products: 0 };
  }
}

export type SearchHit = { product: ProductSummary; score: number; form: FormKey; label: string };
export type SearchOutcome = Decision & { tau: number; delta: number; results: SearchHit[]; candidates: number };

// Vector giải mã một lần cho mỗi chuỗi base64 (chỉ mục trong cache giữ nguyên chuỗi giữa các lượt tìm).
const decoded = new Map<string, Float32Array>();
function vectorOf(base64: string): Float32Array {
  let vector = decoded.get(base64);
  if (!vector) {
    if (decoded.size > 2000) decoded.clear();
    vector = decodeVector(base64);
    decoded.set(base64, vector);
  }
  return vector;
}

// Xếp hạng 1-NN theo cô-sin trên vector đại diện, rồi áp ngưỡng từ chối (docs/chuan/08 mục 4).
export async function searchByEmbedding(model: string, query: Float32Array, limit = 8): Promise<SearchOutcome> {
  const [index, thresholds] = await Promise.all([getSearchIndex(model), getSearchThresholds(model)]);
  const products = new Map(index.map((entry) => [entry.productId, entry.product]));
  const ranked = rankProducts(
    query,
    index.map((entry) => ({
      productId: entry.productId,
      forms: entry.forms.map((form): IndexedForm => ({ form: form.form, label: form.label, embedding: vectorOf(form.embedding) })),
    })),
  );
  const decision = decide(ranked, thresholds);
  return {
    ...decision,
    tau: thresholds.tau,
    delta: thresholds.delta,
    candidates: index.length,
    results: ranked.slice(0, limit).map((hit) => ({ product: products.get(hit.productId)!, score: hit.score, form: hit.form, label: hit.label })),
  };
}
