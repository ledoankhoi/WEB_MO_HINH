// Tìm kiếm sản phẩm bằng ảnh dựa trên biểu diễn đa góc nhìn từ mô hình 3D (docs/chuan/08-tich-hop-ai.md).
// Cấu hình mô hình trích đặc trưng và mọi phép tính dùng chung cho trình duyệt (tiền xử lý, gộp góc nhìn,
// hiệu chỉnh ngưỡng) và máy chủ (xếp hạng, quyết định chấp nhận hay từ chối). Không có I/O.
import type { ProductSummary } from "./types";

export type EmbeddingModel = {
  // Định danh không gian vector, lưu kèm mọi vector trong chỉ mục. Đổi mô hình (hoặc bản nén) thì phải đổi id
  // và lập chỉ mục lại: vector của hai mô hình khác nhau không so sánh được với nhau.
  id: string;
  label: string;
  // File ONNX (đầu vào ảnh [n, 3, size, size], đầu ra [n, dim]). Nhiều đường dẫn = một file chia nhiều phần,
  // ghép lại theo thứ tự (cho nơi lưu giới hạn cỡ file).
  urls: string[];
  dim: number;
  size: number;
  // Chuẩn hoá màu theo tập huấn luyện của CLIP.
  mean: readonly [number, number, number];
  std: readonly [number, number, number];
  // Dung lượng tải lần đầu, để báo cho người dùng.
  megabytes: number;
};

// Bản ONNX của openai/clip-vit-base-patch32 do Hugging Face (Xenova) chuyển đổi, nén 8 bit (89 MB).
const DEFAULT_MODEL_URL = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx";

const envList = (value: string | undefined) => (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

// Ghi đè bằng biến môi trường NEXT_PUBLIC_IMAGE_SEARCH_MODEL_* (đọc lúc build) khi tự lưu mô hình ở nơi khác.
export const IMAGE_SEARCH_MODEL: EmbeddingModel = {
  id: process.env.NEXT_PUBLIC_IMAGE_SEARCH_MODEL_ID?.trim() || "clip-vit-b32-openai-q8",
  label: process.env.NEXT_PUBLIC_IMAGE_SEARCH_MODEL_LABEL?.trim() || "CLIP ViT-B/32 (OpenAI), nén 8 bit",
  urls: envList(process.env.NEXT_PUBLIC_IMAGE_SEARCH_MODEL_URL).length > 0 ? envList(process.env.NEXT_PUBLIC_IMAGE_SEARCH_MODEL_URL) : [DEFAULT_MODEL_URL],
  dim: 512,
  size: 224,
  mean: [0.48145466, 0.4578275, 0.40821073],
  std: [0.26862954, 0.26130258, 0.27577711],
  megabytes: Number(process.env.NEXT_PUBLIC_IMAGE_SEARCH_MODEL_MB) || 89,
};

// ---------------------------------------------------------------------------------------------------------
// Góc nhìn
// ---------------------------------------------------------------------------------------------------------

// Một ảnh dựng từ mô hình 3D. Góc tính bằng độ: phương vị quanh trục đứng (0 = chính diện), góc ngẩng so với
// mặt phẳng ngang. `distance` là hệ số so với khoảng cách vừa khít mô hình.
export type ViewSpec = {
  azimuth: number;
  elevation: number;
  background: string;
  light: number;
  distance: number;
  // Dạng của mô hình: "default" (dáng đứng hoặc dạng robot) hay "alt" (dạng biến hình, ví dụ dạng xe).
  form: FormKey;
  // Làm "xấu" ảnh như ảnh chụp điện thoại (chỉ dùng cho ảnh truy vấn giả lập khi hiệu chỉnh).
  degrade?: Degrade;
};

export type FormKey = "default" | "alt";
export const FORM_KEYS: readonly FormKey[] = ["default", "alt"];

export type Degrade = { crop: number; cropX: number; cropY: number; blur: number; brightness: number; contrast: number; jpeg: number };

// Thư viện: 12 góc cách nhau 30°, góc ngẩng 15° (như MVCNN), nền trắng, ánh sáng chuẩn.
export const INDEX_AZIMUTHS = Array.from({ length: 12 }, (_, index) => index * 30);
export const INDEX_ELEVATION = 15;
export const INDEX_BACKGROUND = "#ffffff";
export const MAX_VIEWS = 24;

export function indexViews(form: FormKey): ViewSpec[] {
  return INDEX_AZIMUTHS.map((azimuth) => ({ azimuth, elevation: INDEX_ELEVATION, background: INDEX_BACKGROUND, light: 1, distance: 1, form }));
}

// Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32), để hai lần hiệu chỉnh trên cùng dữ liệu cho cùng kết quả.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Màu HSL (độ, %, %) thành mã #rrggbb.
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

// Ảnh truy vấn giả lập cho hiệu chỉnh: góc nhìn, nền, ánh sáng, khoảng cách ngẫu nhiên, cắt lệch, mờ, nén JPEG.
// Khác hẳn điều kiện của thư viện để đo được khoảng cách miền giữa ảnh dựng và ảnh chụp.
export function queryViews(count: number, forms: readonly FormKey[], random: () => number): ViewSpec[] {
  const pick = (min: number, max: number) => min + (max - min) * random();
  return Array.from({ length: count }, (_, index) => {
    const hue = Math.floor(random() * 360);
    return {
      azimuth: pick(0, 360),
      elevation: pick(-5, 40),
      background: hslToHex(hue, Math.round(pick(10, 60)), Math.round(pick(35, 85))),
      light: pick(0.5, 1.5),
      distance: pick(0.9, 1.35),
      // Dạng biến hình (nếu có) chiếm khoảng một phần ba số ảnh.
      form: forms.length > 1 && index % 3 === 2 ? forms[1] : forms[0],
      degrade: {
        crop: pick(0, 0.15),
        cropX: random(),
        cropY: random(),
        blur: pick(0, 1.5),
        brightness: pick(0.7, 1.3),
        contrast: pick(0.7, 1.3),
        jpeg: pick(0.35, 0.8),
      },
    };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Tiền xử lý ảnh
// ---------------------------------------------------------------------------------------------------------

// CLIP: thu cạnh ngắn về `size` rồi cắt giữa thành hình vuông. Tương đương lấy hình vuông lớn nhất ở giữa vùng
// đã chọn rồi thu về size × size. Trả về vùng nguồn cần vẽ (toạ độ trên ảnh gốc).
export function centerSquare(rect: { x: number; y: number; width: number; height: number }) {
  const side = Math.min(rect.width, rect.height);
  return { x: rect.x + (rect.width - side) / 2, y: rect.y + (rect.height - side) / 2, width: side, height: side };
}

// Điểm ảnh RGBA (size × size) thành tensor CHW float32: (giá trị/255 − trung bình) / độ lệch chuẩn.
// Ghi vào `out` từ vị trí `offset` để gộp nhiều ảnh thành một lô.
export function pixelsToTensor(
  rgba: ArrayLike<number>,
  size: number,
  model: Pick<EmbeddingModel, "mean" | "std"> = IMAGE_SEARCH_MODEL,
  out: Float32Array = new Float32Array(3 * size * size),
  offset = 0,
): Float32Array {
  const plane = size * size;
  if (rgba.length < plane * 4) throw new Error(`Cần ${plane * 4} giá trị RGBA, nhận ${rgba.length}.`);
  for (let c = 0; c < 3; c++) {
    const mean = model.mean[c];
    const std = model.std[c];
    const base = offset + c * plane;
    for (let i = 0; i < plane; i++) out[base + i] = (rgba[i * 4 + c] / 255 - mean) / std;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------------------------------------

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export const norm = (values: ArrayLike<number>) => Math.sqrt(dot(values, values));

export function l2Normalize(values: ArrayLike<number>): Float32Array {
  const out = Float32Array.from(values as ArrayLike<number>);
  const length = norm(out);
  if (length > 0) for (let i = 0; i < out.length; i++) out[i] /= length;
  return out;
}

// Gộp các góc nhìn (đã chuẩn hoá) bằng trung bình: z̄ = (1/V) Σ z_v, g = z̄ / ‖z̄‖.
// ‖z̄‖ là độ nhất quán giữa các góc (1 = mọi góc cho cùng vector); ‖z̄‖² bằng trung bình cô-sin mọi cặp góc.
export function poolViews(views: readonly ArrayLike<number>[]): { embedding: Float32Array; consistency: number } {
  if (views.length === 0) throw new Error("Cần ít nhất một góc nhìn.");
  const dim = views[0].length;
  const mean = new Float32Array(dim);
  for (const view of views) {
    if (view.length !== dim) throw new Error("Các vector góc nhìn phải cùng số chiều.");
    for (let i = 0; i < dim; i++) mean[i] += view[i] / views.length;
  }
  const consistency = norm(mean);
  return { embedding: l2Normalize(mean), consistency };
}

// Vector float32 ⇄ base64 (4 byte mỗi số, thứ tự byte của máy, thực tế mọi máy đều little-endian).
export function encodeVector(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(Float32Array.from(values as ArrayLike<number>).buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeVector(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

export function bytesToVectors(bytes: Uint8Array, dim: number): Float32Array[] {
  const floats = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return Array.from({ length: Math.floor(floats.length / dim) }, (_, index) => floats.slice(index * dim, (index + 1) * dim));
}

export function vectorsToBytes(vectors: readonly ArrayLike<number>[]): Uint8Array {
  const dim = vectors[0]?.length ?? 0;
  const floats = new Float32Array(vectors.length * dim);
  vectors.forEach((vector, index) => floats.set(vector, index * dim));
  return new Uint8Array(floats.buffer);
}

// Mảng số do trình duyệt gửi lên: đúng số chiều, mọi phần tử hữu hạn, không phải vector 0. Trả về bản đã chuẩn hoá.
export function parseVector(value: unknown, dim: number): Float32Array | null {
  if (!Array.isArray(value) || value.length !== dim) return null;
  if (!value.every((item) => typeof item === "number" && Number.isFinite(item) && Math.abs(item) <= 1e3)) return null;
  return norm(value) > 1e-6 ? l2Normalize(value) : null;
}

// ---------------------------------------------------------------------------------------------------------
// Xếp hạng và quyết định
// ---------------------------------------------------------------------------------------------------------

// Kết quả của POST /api/tim-bang-anh (docs/chuan/06-api.md).
export type ImageSearchResponse = {
  accepted: boolean;
  reason: DecisionReason;
  s1: number;
  s2: number;
  tau: number;
  delta: number;
  candidates: number;
  results: { product: ProductSummary; score: number; form: FormKey; label: string }[];
};

export type IndexedForm = { form: FormKey; label: string; embedding: ArrayLike<number> };
export type Ranked = { productId: string; score: number; form: FormKey; label: string };

// 1-NN theo cô-sin. Sản phẩm có nhiều dạng (robot, xe) lấy điểm của dạng giống nhất; xếp giảm dần.
export function rankProducts(query: ArrayLike<number>, products: readonly { productId: string; forms: readonly IndexedForm[] }[]): Ranked[] {
  const ranked: Ranked[] = [];
  for (const product of products) {
    let best: Ranked | null = null;
    for (const form of product.forms) {
      const score = dot(query, form.embedding);
      if (!best || score > best.score) best = { productId: product.productId, score, form: form.form, label: form.label };
    }
    if (best) ranked.push(best);
  }
  return ranked.sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));
}

export type Thresholds = { tau: number; delta: number };
// Dùng khi quản trị chưa hiệu chỉnh. Trang quản trị nhắc hiệu chỉnh sau khi lập chỉ mục.
export const DEFAULT_THRESHOLDS: Thresholds = { tau: 0.6, delta: 0.02 };

export type DecisionReason = "match" | "low-score" | "ambiguous" | "empty";
export type Decision = { accepted: boolean; reason: DecisionReason; s1: number; s2: number };

// Chấp nhận khi s₁ ≥ τ (đủ giống) và s₁ − s₂ ≥ δ (không lưỡng lự giữa hai sản phẩm). Chỉ có một sản phẩm
// trong chỉ mục thì s₂ = −1 (cô-sin nhỏ nhất), điều kiện cách biệt luôn thoả.
export function decide(ranked: readonly Pick<Ranked, "score">[], thresholds: Thresholds): Decision {
  if (ranked.length === 0) return { accepted: false, reason: "empty", s1: 0, s2: 0 };
  const s1 = ranked[0].score;
  const s2 = ranked[1]?.score ?? -1;
  if (s1 < thresholds.tau) return { accepted: false, reason: "low-score", s1, s2 };
  if (s1 - s2 < thresholds.delta) return { accepted: false, reason: "ambiguous", s1, s2 };
  return { accepted: true, reason: "match", s1, s2 };
}

export const isValidThresholds = (value: Thresholds) =>
  Number.isFinite(value.tau) && Number.isFinite(value.delta) && value.tau >= -1 && value.tau <= 1 && value.delta >= 0 && value.delta <= 2;

// ---------------------------------------------------------------------------------------------------------
// Hiệu chỉnh ngưỡng
// ---------------------------------------------------------------------------------------------------------

// Một ảnh truy vấn đã chấm điểm. `known`: sản phẩm có trong thư viện (khi đó `correct` cho biết hạng 1 có đúng
// không). Ảnh "không bán" lấy bằng cách bỏ chính sản phẩm đó khỏi thư viện (bỏ một sản phẩm, leave-one-out).
export type CalibrationSample = { s1: number; s2: number; known: boolean; correct: boolean };

export type Rates = {
  // Trên ảnh sản phẩm có bán: trả đúng, trả sai, từ chối oan (cộng lại bằng 1).
  correctAccept: number;
  wrongAccept: number;
  falseReject: number;
  // Trên ảnh không bán: tỉ lệ bị chấp nhận nhầm (FAR).
  falseAccept: number;
  known: number;
  unknown: number;
};

export function evaluateThresholds(samples: readonly CalibrationSample[], thresholds: Thresholds): Rates {
  let known = 0;
  let unknown = 0;
  let correctAccept = 0;
  let wrongAccept = 0;
  let falseAccept = 0;
  for (const sample of samples) {
    const accepted = sample.s1 >= thresholds.tau && sample.s1 - sample.s2 >= thresholds.delta;
    if (sample.known) {
      known++;
      if (accepted && sample.correct) correctAccept++;
      else if (accepted) wrongAccept++;
    } else {
      unknown++;
      if (accepted) falseAccept++;
    }
  }
  const rate = (count: number, total: number) => (total > 0 ? count / total : 0);
  return {
    correctAccept: rate(correctAccept, known),
    wrongAccept: rate(wrongAccept, known),
    falseReject: rate(known - correctAccept - wrongAccept, known),
    falseAccept: rate(falseAccept, unknown),
    known,
    unknown,
  };
}

export type CalibrationResult = Thresholds & { farMax: number; select: Rates; test: Rates };

// Dò lưới τ ∈ [0, 1] (bước 0,005), δ ∈ [0, 0,2] (bước 0,0025) trên tập chọn ngưỡng: giữ FAR ≤ farMax, lấy cặp
// có tỉ lệ trả đúng cao nhất, hoà thì FAR thấp hơn. Nhiều cặp cùng tốt nhất thì lấy cặp gần trung vị của chúng
// (nằm giữa vùng tốt, ít nhạy với dữ liệu mới hơn là cặp sát mép). Báo cả kết quả trên tập kiểm tra (không dùng
// để chọn) cho ước lượng trung thực.
export function calibrateThresholds(select: readonly CalibrationSample[], test: readonly CalibrationSample[], farMax = 0.05): CalibrationResult {
  const EPS = 1e-12;
  let best: Rates | null = null;
  let tied: Thresholds[] = [];
  for (let i = 0; i <= 200; i++) {
    const tau = (i * 5) / 1000;
    for (let j = 0; j <= 80; j++) {
      const delta = (j * 25) / 10000;
      const rates = evaluateThresholds(select, { tau, delta });
      if (rates.falseAccept > farMax + EPS) continue;
      const better = !best || rates.correctAccept > best.correctAccept + EPS || (rates.correctAccept > best.correctAccept - EPS && rates.falseAccept < best.falseAccept - EPS);
      const same = best && Math.abs(rates.correctAccept - best.correctAccept) <= EPS && Math.abs(rates.falseAccept - best.falseAccept) <= EPS;
      if (better) {
        best = rates;
        tied = [{ tau, delta }];
      } else if (same) {
        tied.push({ tau, delta });
      }
    }
  }
  // Không cặp nào giữ được FAR (có ảnh không bán giống hệt ảnh thư viện): từ chối mọi ảnh.
  if (tied.length === 0) {
    const closed = { tau: 1, delta: 2 };
    return { ...closed, farMax, select: evaluateThresholds(select, closed), test: evaluateThresholds(test, closed) };
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  };
  const center = { tau: median(tied.map((t) => t.tau)), delta: median(tied.map((t) => t.delta)) };
  const chosen = tied.reduce((a, b) =>
    Math.abs(b.tau - center.tau) / 0.005 + Math.abs(b.delta - center.delta) / 0.0025 < Math.abs(a.tau - center.tau) / 0.005 + Math.abs(a.delta - center.delta) / 0.0025 ? b : a,
  );
  return { ...chosen, farMax, select: evaluateThresholds(select, chosen), test: evaluateThresholds(test, chosen) };
}
