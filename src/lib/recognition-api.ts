// Hợp đồng của POST /api/nhan-dien (B11) và các hàm thuần dùng chung cho route và test.
// Trình duyệt chạy mô hình, tính softmax(z / T) rồi gửi toàn bộ xác suất (mỗi lớp một số, làm tròn 6 chữ số), không gửi ảnh.
// Gửi đủ mọi lớp (khoảng 200 số, vài KB) chứ không chỉ top-10 như bản kế hoạch: luật theo cấp cộng xác suất mọi lớp cùng
// nhân vật hoặc cùng franchise, chỉ có top-10 thì máy chủ không tính lại đúng được.
import type { ProductSummary } from "./types";
import { decide, type Hierarchy, type RecognitionLabel, type RecognitionResult } from "./recognition";

export const RECOGNITION_ROUND = 1e6;
// Tổng xác suất sau khi làm tròn 6 chữ số lệch tối đa n · 5e-7; cho thêm biên rộng hơn nhiều để không từ chối oan.
const SUM_TOLERANCE = 0.01;

export type RecognitionRobotInfo = {
  slug: string;
  name: string;
  character: string;
  franchise: string;
  franchiseLabel: string;
  series: string;
  faction: string;
  altMode: string;
  description: string;
  image: string | null;
  sourceUrl: string | null;
};

// Một dòng của bảng xếp hạng: robot và xác suất mô hình cho (đã hiệu chỉnh nhiệt độ T).
export type RecognitionRankEntry = { slug: string; name: string; series: string; franchiseLabel: string; image: string | null; p: number };

// Trang khách tạm thời chỉ hiện bảng xếp hạng (chủ dự án quyết định ngày 15/11/2026, khi mới xong một phần đề tài): luật trả lời
// theo cấp (`decide`, src/lib/recognition.ts) vẫn chạy ở máy chủ để ghi nhật ký `recognition_logs`, nhưng không gửi về trình duyệt.
export type RecognitionResponse = {
  model: string;
  // Các robot có xác suất cao nhất, giảm dần.
  ranking: RecognitionRankEntry[];
  // Sản phẩm đang bán của các robot trong bảng, theo thứ hạng (hạng 1 trước), bỏ trùng.
  products: ProductSummary[];
};

// Kiểm tra mảng xác suất trình duyệt gửi lên: đúng số lớp, mỗi số trong [0; 1], tổng gần 1.
export function parseProbabilities(value: unknown, classes: number): number[] | null {
  if (!Array.isArray(value) || value.length !== classes) return null;
  let sum = 0;
  for (const p of value) {
    if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return null;
    sum += p;
  }
  return Math.abs(sum - 1) <= SUM_TOLERANCE ? (value as number[]) : null;
}

export const roundProbability = (p: number) => Math.round(p * RECOGNITION_ROUND) / RECOGNITION_ROUND;

// Thời gian chạy ở trình duyệt khách báo lên: chỉ để thống kê, kẹp vào [0; 10 phút].
export function parseClientMs(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(600_000, Math.max(0, Math.round(value))) : null;
}

// Sản phẩm của nhiều robot, bỏ trùng theo mã, giữ thứ tự, tối đa `limit`.
export function mergeProducts(groups: readonly (readonly ProductSummary[] | undefined)[], limit = 8): ProductSummary[] {
  const seen = new Set<string>();
  const out: ProductSummary[] = [];
  for (const group of groups) {
    for (const product of group ?? []) {
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      out.push(product);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type RecognitionModelView = {
  id: string;
  labels: RecognitionLabel[];
  thresholds: [number, number, number];
  temperature: number;
};

export const RECOGNITION_RANKING = 5;
export const RECOGNITION_PRODUCTS = 9;

// Dựng câu trả lời từ xác suất đã kiểm tra: bảng xếp hạng `size` robot (tên, dòng từ CSDL, thiếu thì lấy từ labels của mô hình)
// và sản phẩm đang bán của chúng. `result` là kết quả của luật theo cấp, chỉ để ghi nhật ký.
export function buildRecognitionResponse(
  model: RecognitionModelView,
  hierarchy: Hierarchy,
  probs: number[],
  catalog: { robots: Record<string, Partial<RecognitionRobotInfo>>; products: Record<string, readonly ProductSummary[]> },
  size = RECOGNITION_RANKING,
): { response: RecognitionResponse; result: RecognitionResult } {
  const result = decide(probs, hierarchy, model.thresholds, size);
  const { robots, products } = catalog;
  const franchiseLabels = new Map<string, string>();
  for (const robot of Object.values(robots)) {
    if (robot.franchise && robot.franchiseLabel && !franchiseLabels.has(robot.franchise)) franchiseLabels.set(robot.franchise, robot.franchiseLabel);
  }
  const ranking = result.alternatives.map(({ index, p }): RecognitionRankEntry => {
    const label = model.labels[index];
    const robot = robots[label.slug] ?? {};
    return {
      slug: label.slug,
      name: robot.name ?? label.name,
      series: robot.series ?? label.series,
      franchiseLabel: robot.franchiseLabel ?? franchiseLabels.get(label.franchise) ?? label.franchise,
      image: robot.image ?? null,
      p: roundProbability(p),
    };
  });
  const response: RecognitionResponse = {
    model: model.id,
    ranking,
    products: mergeProducts(
      ranking.map((row) => products[row.slug]),
      RECOGNITION_PRODUCTS,
    ),
  };
  return { response, result };
}
