// Nhập dữ liệu nhận dạng robot (docs/nhan-dang-robot/00-ke-hoach.md, B10): kiểm tra robots.json (bước B1) và
// model-card.json + labels.json (bước B9) trước khi ghi vào CSDL. Hàm thuần: Server Action và test dùng chung.
import type { RecognitionLabel } from "./recognition";

export type RobotRecord = {
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
  aliases: string[];
  // Sản phẩm của cửa hàng mà B1 ghép với robot này (slug sản phẩm): chỉ là gợi ý, quản trị xác nhận mới ghép thật.
  storeProducts: string[];
};

export type ModelInput = { size: number; resize: number; mean: [number, number, number]; std: [number, number, number] };

export type ModelRecord = {
  id: string;
  label: string;
  arch: string;
  variant: string;
  files: string[];
  mb: number;
  input: ModelInput;
  temperature: number;
  thresholds: [number, number, number];
  labels: RecognitionLabel[];
  metrics: Record<string, unknown>;
  datasetVersion: string;
  smoke: boolean;
};

export type Parsed<T> = { value: T | null; errors: string[] };

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_ERRORS = 20;
const DESCRIPTION_MAX = 4000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const httpsUrl = (value: unknown): string | null => (typeof value === "string" && /^https:\/\/[^\s]+$/.test(value) && value.length <= 1000 ? value : null);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function collect(errors: string[], message: string) {
  if (errors.length < MAX_ERRORS) errors.push(message);
  else if (errors.length === MAX_ERRORS) errors.push("… và các lỗi khác.");
}

// robots.json của B1: { version, classes: [{ slug, name, display_name, character, franchise, franchise_label, series, faction,
// aliases, description, image: { url }, wiki: { url }, store_products }] }.
export function parseRobotsFile(data: unknown): Parsed<RobotRecord[]> {
  const errors: string[] = [];
  if (!isObject(data) || !Array.isArray(data.classes)) return { value: null, errors: ["File không đúng dạng robots.json của bước B1 (thiếu mảng classes)."] };
  if (data.classes.length === 0 || data.classes.length > 2000) return { value: null, errors: ["Danh sách robot phải có từ 1 đến 2.000 robot."] };
  const seen = new Set<string>();
  const robots: RobotRecord[] = [];
  data.classes.forEach((item: unknown, i) => {
    const where = `Robot thứ ${i + 1}`;
    if (!isObject(item)) return collect(errors, `${where}: không phải đối tượng JSON.`);
    const slug = typeof item.slug === "string" ? item.slug : "";
    if (!SLUG.test(slug) || slug.length > 120) return collect(errors, `${where}: slug "${slug.slice(0, 40)}" không hợp lệ (chữ thường không dấu, số, gạch nối).`);
    if (seen.has(slug)) return collect(errors, `${where}: slug ${slug} bị trùng.`);
    seen.add(slug);
    const name = text(item.display_name, 200) || text(item.name, 200);
    const franchise = text(item.franchise, 60);
    if (!name) return collect(errors, `${where} (${slug}): thiếu tên.`);
    if (!SLUG.test(franchise)) return collect(errors, `${where} (${slug}): franchise "${franchise}" không hợp lệ.`);
    const list = (value: unknown, max: number) =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim().slice(0, max)).slice(0, 50) : [];
    const image = isObject(item.image) ? httpsUrl(item.image.url) : httpsUrl(item.image);
    const sourceUrl = isObject(item.wiki) ? httpsUrl(item.wiki.url) : httpsUrl(item.source_url);
    const description = text(item.description, DESCRIPTION_MAX + 1);
    robots.push({
      slug,
      name,
      character: text(item.character, 200) || name,
      franchise,
      franchiseLabel: text(item.franchise_label, 100) || franchise,
      series: text(item.series, 200),
      faction: text(item.faction, 100),
      altMode: text(item.alt_mode, 200) || (isObject(item.extra) ? text(item.extra.alt_mode, 200) : ""),
      description: description.length > DESCRIPTION_MAX ? `${description.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…` : description,
      image,
      sourceUrl,
      aliases: list(item.aliases, 120),
      storeProducts: list(item.store_products, 120).filter((s) => SLUG.test(s)),
    });
  });
  return errors.length > 0 ? { value: null, errors } : { value: robots, errors };
}

function triple(value: unknown, positive: boolean): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(finite)) return null;
  if (positive && !value.every((v) => v > 0)) return null;
  return [value[0], value[1], value[2]];
}

// model-card.json và labels.json do ml/scripts/b09_xuat_onnx.py sinh. File mô hình đã tải lên kho media ở
// <MEDIA_BASE_URL>/ml/<mã mô hình>/<tên file>; card chỉ ghi tên file, máy chủ tự ghép đường dẫn để không trỏ ra ngoài kho.
export function parseModelCard(card: unknown, labels: unknown, options: { mediaBase: string; robotSlugs: ReadonlySet<string> }): Parsed<ModelRecord> {
  const errors: string[] = [];
  const mediaBase = options.mediaBase.trim().replace(/\/$/, "");
  if (!/^https:\/\/[^\s]+$/.test(mediaBase)) return { value: null, errors: ["Chưa cấu hình MEDIA_BASE_URL (kho media https) nên không ghép được đường dẫn file mô hình."] };
  if (!isObject(card)) return { value: null, errors: ["model-card.json không phải đối tượng JSON."] };
  const id = typeof card.id === "string" ? card.id : "";
  if (!SLUG.test(id) || id.length > 100) collect(errors, `Mã mô hình "${id.slice(0, 40)}" không hợp lệ.`);
  const label = text(card.label, 120);
  const arch = text(card.arch, 60);
  if (!label) collect(errors, "Thiếu tên mô hình (label).");
  if (!arch) collect(errors, "Thiếu kiến trúc (arch).");

  const input = isObject(card.input) ? card.input : {};
  const size = input.size;
  const resize = input.resize_short_side;
  const mean = triple(input.mean, false);
  const std = triple(input.std, true);
  if (!Number.isInteger(size) || (size as number) < 32 || (size as number) > 1024) collect(errors, "Kích thước ảnh vào (input.size) phải là số nguyên 32–1024.");
  if (!Number.isInteger(resize) || (resize as number) < (size as number) || (resize as number) > 2048) collect(errors, "input.resize_short_side phải là số nguyên, không nhỏ hơn input.size.");
  if (!mean || !std) collect(errors, "input.mean và input.std phải là 3 số (std dương).");
  // Trình duyệt chỉ cài đúng cách tiền xử lý lúc huấn luyện: thu cạnh ngắn bằng song tuyến rồi cắt giữa.
  if (input.interpolation !== "bilinear" || input.crop !== "center") collect(errors, "Chỉ hỗ trợ tiền xử lý song tuyến + cắt giữa (input.interpolation = bilinear, input.crop = center).");

  const temperature = card.temperature;
  if (!finite(temperature) || temperature <= 0 || temperature > 100) collect(errors, "Nhiệt độ hiệu chỉnh (temperature) phải là số dương.");
  const thresholds = card.thresholds === null || card.thresholds === undefined ? null : triple(card.thresholds, false);
  if (!thresholds) collect(errors, "Thiếu ngưỡng t₁–t₃ (thresholds): cần chạy đánh giá B8 trước khi xuất mô hình ở B9.");
  else if (!thresholds.every((t) => t >= 0 && t <= 1.01)) collect(errors, "Ngưỡng t₁–t₃ phải nằm trong [0; 1,01].");

  const files: string[] = [];
  if (!Array.isArray(card.files) || card.files.length === 0 || card.files.length > 20) collect(errors, "Danh sách file mô hình (files) phải có 1–20 phần.");
  else
    card.files.forEach((file: unknown, i) => {
      const name = isObject(file) && typeof file.name === "string" ? file.name : "";
      if (!/^[A-Za-z0-9._-]+\.onnx$/.test(name) || name.includes("..")) return collect(errors, `File thứ ${i + 1}: tên "${name.slice(0, 40)}" không hợp lệ.`);
      if (!isObject(file) || !Number.isInteger(file.bytes) || (file.bytes as number) <= 0 || !/^[a-f0-9]{64}$/.test(String(file.sha256))) {
        return collect(errors, `File ${name}: thiếu kích thước hoặc mã SHA-256.`);
      }
      files.push(`${mediaBase}/ml/${id}/${name}`);
    });
  const mb = card.mb;
  if (!finite(mb) || mb <= 0 || mb > 2000) collect(errors, "Dung lượng mô hình (mb) không hợp lệ.");
  const datasetVersion = text(card.dataset_version, 128);
  if (datasetVersion.length < 6) collect(errors, "Thiếu phiên bản dữ liệu (dataset_version).");

  const parsedLabels: RecognitionLabel[] = [];
  if (!Array.isArray(labels) || labels.length === 0) collect(errors, "labels.json phải là mảng nhãn, xếp theo chỉ số lớp.");
  else {
    if (card.classes !== labels.length) collect(errors, `Mô hình có ${String(card.classes)} lớp nhưng labels.json có ${labels.length} nhãn.`);
    labels.forEach((item: unknown, i) => {
      if (!isObject(item) || item.index !== i) return collect(errors, `Nhãn thứ ${i + 1}: chỉ số phải là ${i} (labels.json xếp theo chỉ số lớp).`);
      const slug = typeof item.slug === "string" ? item.slug : "";
      if (!options.robotSlugs.has(slug)) return collect(errors, `Nhãn ${i} (${slug.slice(0, 60)}) không có trong danh sách robot: nhập robots.json trước.`);
      parsedLabels.push({
        index: i,
        slug,
        name: text(item.name, 200) || slug,
        character: text(item.character, 200) || text(item.name, 200) || slug,
        franchise: text(item.franchise, 60),
        series: text(item.series, 200),
      });
    });
  }
  if (errors.length > 0 || !mean || !std || !thresholds) return { value: null, errors };
  return {
    value: {
      id,
      label,
      arch,
      variant: text(card.variant, 30),
      files,
      mb: mb as number,
      input: { size: size as number, resize: resize as number, mean, std },
      temperature: temperature as number,
      thresholds,
      labels: parsedLabels,
      metrics: isObject(card.metrics) ? card.metrics : {},
      datasetVersion,
      smoke: card.smoke === true,
    },
    errors,
  };
}
