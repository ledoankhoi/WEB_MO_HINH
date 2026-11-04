// Phép tính của hiệu chỉnh và đánh giá tìm kiếm bằng ảnh (docs/chuan/08-tich-hop-ai.md mục 6): chấm điểm một
// ảnh truy vấn với thư viện đầy đủ và với thư viện đã bỏ chính sản phẩm đó, đổi thành mẫu hiệu chỉnh, tính
// Recall@K, MRR và xuất CSV. Không có I/O, không dựng ảnh: dùng được ở trình duyệt, máy chủ và trong test.
import { dot, rankProducts, type CalibrationSample, type FormKey, type IndexedForm } from "./image-search";

export type GalleryEntry = {
  productId: string;
  name: string;
  modelUrl: string | null;
  // Vector đại diện (trung bình các góc) và vector từng góc của mỗi dạng, đã chuẩn hoá.
  forms: { form: FormKey; label: string; embedding: Float32Array; views: Float32Array[] }[];
};

// Hai cách gộp góc nhìn được so sánh: trung bình (đang dùng khi tìm thật) và maxview (lấy góc giống nhất).
export type Pooling = "mean" | "maxview";

export function rankGallery(query: ArrayLike<number>, gallery: readonly GalleryEntry[], pooling: Pooling): { productId: string; score: number }[] {
  if (pooling === "mean") {
    return rankProducts(
      query,
      gallery.map((entry) => ({ productId: entry.productId, forms: entry.forms.map((form): IndexedForm => ({ form: form.form, label: form.label, embedding: form.embedding })) })),
    );
  }
  return gallery
    .map((entry) => {
      let score = -Infinity;
      for (const form of entry.forms) for (const view of form.views) score = Math.max(score, dot(query, view));
      return { productId: entry.productId, score };
    })
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
}

export type QueryScore = {
  // Thư viện đầy đủ: hạng của đúng sản phẩm (1 = đứng đầu, 0 = không có trong thư viện), điểm hạng 1, hạng 2.
  rank: number;
  s1: number;
  s2: number;
  top: string;
  // Bỏ chính sản phẩm khỏi thư viện (đóng vai hàng cửa hàng không bán): điểm hạng 1, hạng 2.
  looS1: number;
  looS2: number;
  looTop: string;
};

// Như decide(): thiếu hạng 2 thì s₂ = −1; thư viện rỗng thì s₁ = 0.
export function scoreQuery(query: ArrayLike<number>, ownerId: string, gallery: readonly GalleryEntry[], pooling: Pooling): QueryScore {
  const full = rankGallery(query, gallery, pooling);
  const without = full.filter((hit) => hit.productId !== ownerId);
  return {
    rank: full.findIndex((hit) => hit.productId === ownerId) + 1,
    s1: full[0]?.score ?? 0,
    s2: full[1]?.score ?? -1,
    top: full[0]?.productId ?? "",
    looS1: without[0]?.score ?? 0,
    looS2: without[1]?.score ?? -1,
    looTop: without[0]?.productId ?? "",
  };
}

export type QueryRecord = QueryScore & {
  productId: string;
  name: string;
  form: FormKey;
  index: number;
  // Ảnh chẵn vào tập chọn ngưỡng, ảnh lẻ vào tập kiểm tra.
  split: "select" | "test";
  pooling: Pooling;
};

export const splitOf = (index: number): QueryRecord["split"] => (index % 2 === 0 ? "select" : "test");

// Mỗi ảnh truy vấn cho hai mẫu: "có bán" (thư viện đầy đủ) và "không bán" (bỏ chính sản phẩm đó).
export function toSamples(records: readonly QueryScore[]): CalibrationSample[] {
  return records.flatMap((record) => [
    { s1: record.s1, s2: record.s2, known: true, correct: record.rank === 1 },
    { s1: record.looS1, s2: record.looS2, known: false, correct: false },
  ]);
}

// Đánh giá tập đóng (chưa áp ngưỡng): Recall@1, Recall@5, MRR theo hạng của đúng sản phẩm.
export function closedSet(records: readonly Pick<QueryScore, "rank">[]) {
  const ranks = records.map((record) => record.rank).filter((rank) => rank > 0);
  const share = (hit: (rank: number) => boolean) => (ranks.length ? ranks.filter(hit).length / ranks.length : 0);
  return {
    queries: ranks.length,
    recall1: share((rank) => rank === 1),
    recall5: share((rank) => rank <= 5),
    mrr: ranks.length ? ranks.reduce((sum, rank) => sum + 1 / rank, 0) / ranks.length : 0,
  };
}

// Hạt giống riêng cho mỗi sản phẩm (FNV-1a trên mã sản phẩm), để thêm hay bớt sản phẩm không làm đổi ảnh truy
// vấn của sản phẩm khác.
export function productSeed(seed: number, productId: string): number {
  let hash = (seed ^ 0x811c9dc5) >>> 0;
  for (const char of productId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

// Số liệu thô để phân tích ngoài (luận văn): mỗi dòng một ảnh truy vấn và một cách gộp.
export function recordsToCsv(records: readonly QueryRecord[], names: ReadonlyMap<string, string>): string {
  const header = ["san_pham", "dang", "anh", "tap", "cach_gop", "hang_dung", "s1", "s2", "hang_1", "loo_s1", "loo_s2", "loo_hang_1"];
  const cell = (value: string | number) => (typeof value === "number" ? String(value) : `"${value.replaceAll('"', '""')}"`);
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const rows = records.map((r) =>
    [r.name, r.form, r.index, r.split, r.pooling, r.rank, round(r.s1), round(r.s2), names.get(r.top) ?? r.top, round(r.looS1), round(r.looS2), names.get(r.looTop) ?? r.looTop]
      .map((value) => cell(value))
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
