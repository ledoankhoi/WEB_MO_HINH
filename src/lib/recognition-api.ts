// Hợp đồng của POST /api/nhan-dien (B11) và các hàm thuần dùng chung cho route và test.
// Trình duyệt chạy mô hình, tính softmax(z / T) rồi gửi toàn bộ xác suất (mỗi lớp một số, làm tròn 6 chữ số), không gửi ảnh.
// Gửi đủ mọi lớp (khoảng 200 số, vài KB) chứ không chỉ top-10 như bản kế hoạch: luật theo cấp cộng xác suất mọi lớp cùng
// nhân vật hoặc cùng franchise, chỉ có top-10 thì máy chủ không tính lại đúng được.
import type { ProductSummary } from "./types";
import { decide, type Hierarchy, type RecognitionLabel, type RecognitionLevel, type RecognitionResult } from "./recognition";

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

export type RecognitionAlternative = { slug: string; name: string; series: string; franchiseLabel: string; image: string | null; p: number };

export type RecognitionResponse = {
  model: string;
  level: RecognitionLevel;
  // Lớp có xác suất cao nhất (luôn có, kể cả khi level là "none"; giao diện chỉ khẳng định theo level).
  robot: RecognitionRobotInfo;
  character: { name: string; p: number };
  franchise: { key: string; label: string; p: number };
  pClass: number;
  alternatives: RecognitionAlternative[];
  // Sản phẩm đang bán: của đúng robot (level "class") hoặc của mọi dòng cùng nhân vật (level "character").
  products: ProductSummary[];
  thresholds: [number, number, number];
  temperature: number;
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

// Dựng câu trả lời từ xác suất đã kiểm tra: áp luật theo cấp (cùng hàm decide() với trình duyệt), kèm thông tin robot từ CSDL
// (thiếu thì lấy từ labels của mô hình) và sản phẩm đang bán theo cấp trả lời.
export function buildRecognitionResponse(
  model: RecognitionModelView,
  hierarchy: Hierarchy,
  probs: number[],
  catalog: { robots: Record<string, Partial<RecognitionRobotInfo>>; products: Record<string, readonly ProductSummary[]> },
  alternatives = 4,
): { response: RecognitionResponse; result: RecognitionResult } {
  const result = decide(probs, hierarchy, model.thresholds, alternatives + 1);
  const { robots, products } = catalog;
  const top = model.labels[result.classIndex];
  const info = robots[top.slug] ?? {};
  const franchiseKey = hierarchy.franchises[result.franchiseIndex];
  const franchiseLabel = Object.values(robots).find((robot) => robot.franchise === franchiseKey)?.franchiseLabel ?? franchiseKey;
  const character = hierarchy.characters[result.characterIndex];
  const sameCharacter = model.labels.filter((_, i) => hierarchy.classCharacter[i] === result.characterIndex).map((label) => label.slug);
  const shown =
    result.level === "class"
      ? mergeProducts([products[top.slug], ...sameCharacter.map((slug) => products[slug])])
      : result.level === "character"
        ? mergeProducts(sameCharacter.map((slug) => products[slug]))
        : [];
  const response: RecognitionResponse = {
    model: model.id,
    level: result.level,
    robot: {
      slug: top.slug,
      name: info.name ?? top.name,
      character: info.character ?? top.character,
      franchise: info.franchise ?? top.franchise,
      franchiseLabel: info.franchiseLabel ?? franchiseLabel,
      series: info.series ?? top.series,
      faction: info.faction ?? "",
      altMode: info.altMode ?? "",
      description: info.description ?? "",
      image: info.image ?? null,
      sourceUrl: info.sourceUrl ?? null,
    },
    character: { name: character.name, p: roundProbability(result.pCharacter) },
    franchise: { key: franchiseKey, label: franchiseLabel, p: roundProbability(result.pFranchise) },
    pClass: roundProbability(result.pClass),
    alternatives: result.alternatives.slice(1).map(({ index, p }) => {
      const label = model.labels[index];
      const robot = robots[label.slug] ?? {};
      return { slug: label.slug, name: robot.name ?? label.name, series: robot.series ?? label.series, franchiseLabel: robot.franchiseLabel ?? label.franchise, image: robot.image ?? null, p: roundProbability(p) };
    }),
    products: shown,
    thresholds: model.thresholds,
    temperature: model.temperature,
  };
  return { response, result };
}
