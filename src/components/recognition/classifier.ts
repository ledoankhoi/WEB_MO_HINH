// Chạy mô hình nhận dạng robot ngay trong trình duyệt (B11). Dùng chung worker ONNX của tìm kiếm bằng ảnh
// (public/image-search/worker.js: tải các phần của file, lưu đệm, chạy phiên ONNX Runtime Web, trả đầu ra thô). Tiền xử lý làm ở
// luồng chính bằng hàm thuần src/lib/recognition-preprocess.ts, giống hệt lúc huấn luyện. Chỉ dùng ở client.
import { prepareImage, rgbaToRgb, toTensor, type Rgb } from "@/lib/recognition-preprocess";
import type { ModelInput } from "@/lib/recognition-import";
import type { LoadInfo, LoadProgress } from "@/components/image-search/embedder";

export type ClassifierModel = { id: string; files: string[]; input: ModelInput; classes: number };

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void; onProgress?: (progress: LoadProgress) => void };
type WorkerMessage =
  | { id: number; type: "progress"; loaded: number; total: number; stage?: "init" }
  | { id: number; type: "loaded"; cached: boolean; ms: number }
  | { id: number; type: "embedded"; data: Float32Array; dim: number; ms: number }
  | { id: number; type: "error"; message: string };

// Trùng với CACHE_NAME trong public/image-search/worker.js.
const CACHE_NAME = "robotica-image-search-v1";

const absolute = (urls: string[]) => urls.map((url) => new URL(url, location.href).href);

export async function isClassifierCached(model: ClassifierModel): Promise<boolean> {
  try {
    if (!("caches" in globalThis)) return false;
    const cache = await caches.open(CACHE_NAME);
    const hits = await Promise.all(absolute(model.files).map((url) => cache.match(url)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

// Ảnh 8 bit đúng như mô hình thấy (sau khi thu nhỏ và cắt giữa), dùng để hiện cho khách.
export function preparedToDataUrl(img: Rgb): string {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const data = context.createImageData(img.width, img.height);
  for (let i = 0, j = 0; i < img.width * img.height * 3; i += 3, j += 4) {
    data.data[j] = img.data[i];
    data.data[j + 1] = img.data[i + 1];
    data.data[j + 2] = img.data[i + 2];
    data.data[j + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  return canvas.toDataURL("image/webp", 0.8);
}

// Điểm ảnh của một vùng trên canvas (không qua phép thu nhỏ của trình duyệt), rồi tiền xử lý như Python.
export function prepareFromCanvas(source: HTMLCanvasElement, input: ModelInput, region?: { x: number; y: number; width: number; height: number }): Rgb {
  const area = region ?? { x: 0, y: 0, width: source.width, height: source.height };
  const x = Math.max(0, Math.round(area.x));
  const y = Math.max(0, Math.round(area.y));
  const width = Math.max(1, Math.min(source.width - x, Math.round(area.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(area.height)));
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trình duyệt không hỗ trợ canvas 2D.");
  const pixels = context.getImageData(x, y, width, height).data;
  return prepareImage(rgbaToRgb(pixels, width, height), input);
}

class Classifier {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private loading: { key: string; promise: Promise<LoadInfo> } | null = null;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker("/image-search/worker.js", { type: "module", name: "recognition" });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      if (message.type === "progress") {
        pending.onProgress?.(message);
        return;
      }
      this.pending.delete(message.id);
      if (message.type === "error") pending.reject(new Error(message.message));
      else pending.resolve(message as never);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Không chạy được mô hình nhận dạng.");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.worker = null;
      this.loading = null;
    };
    this.worker = worker;
    return worker;
  }

  private call<T>(message: Record<string, unknown>, transfer: Transferable[] = [], onProgress?: (progress: LoadProgress) => void): Promise<T> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: never) => void, reject, onProgress });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  load(model: ClassifierModel, onProgress?: (progress: LoadProgress) => void): Promise<LoadInfo> {
    if (this.loading?.key !== model.id) {
      const promise = this.call<{ cached: boolean; ms: number }>({ type: "load", urls: absolute(model.files), key: model.id }, [], onProgress).then(
        ({ cached, ms }) => ({ cached, ms }),
        (error: Error) => {
          this.loading = null;
          throw error;
        },
      );
      this.loading = { key: model.id, promise };
    }
    return this.loading.promise;
  }

  // Logits của một ảnh đã tiền xử lý.
  async logits(model: ClassifierModel, prepared: Rgb): Promise<{ logits: Float32Array; ms: number }> {
    await this.load(model);
    const tensor = toTensor(prepared, model.input.mean, model.input.std);
    const result = await this.call<{ data: Float32Array; dim: number; ms: number }>({ type: "embed", data: tensor, count: 1, size: model.input.size }, [tensor.buffer]);
    if (result.dim !== model.classes) throw new Error(`Mô hình trả ${result.dim} giá trị, cần ${model.classes} lớp.`);
    return { logits: result.data, ms: result.ms };
  }
}

let shared: Classifier | null = null;

export function getClassifier(): Classifier {
  shared ??= new Classifier();
  return shared;
}
