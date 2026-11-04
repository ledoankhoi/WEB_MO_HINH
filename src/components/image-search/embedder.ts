// Trích đặc trưng ảnh ngay trong trình duyệt (YC-AI-02). Quản lý một Web Worker (public/image-search/worker.js)
// chạy ONNX Runtime Web; mô hình tải một lần rồi lưu trong bộ nhớ đệm của trình duyệt. Chỉ dùng ở client.
import { IMAGE_SEARCH_MODEL, l2Normalize, pixelsToTensor } from "@/lib/image-search";

export type LoadProgress = { loaded: number; total: number; stage?: "init" };
export type LoadInfo = { cached: boolean; ms: number };

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void; onProgress?: (progress: LoadProgress) => void };
type WorkerMessage =
  | { id: number; type: "progress"; loaded: number; total: number; stage?: "init" }
  | { id: number; type: "loaded"; cached: boolean; ms: number }
  | { id: number; type: "embedded"; data: Float32Array; dim: number; ms: number }
  | { id: number; type: "error"; message: string };

// Số ảnh tối đa mỗi lượt gửi vào mô hình (mỗi ảnh 3 × 224 × 224 số float32, khoảng 600 KB).
const BATCH = 12;
// Trùng với CACHE_NAME trong public/image-search/worker.js.
const CACHE_NAME = "robotica-image-search-v1";

const absoluteUrls = () => IMAGE_SEARCH_MODEL.urls.map((url) => new URL(url, location.href).href);

// Mô hình đã nằm trong bộ nhớ đệm của trình duyệt chưa (để báo trước có phải tải hay không).
export async function isModelCached(): Promise<boolean> {
  try {
    if (!("caches" in globalThis)) return false;
    const cache = await caches.open(CACHE_NAME);
    const hits = await Promise.all(absoluteUrls().map((url) => cache.match(url)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

// Trình duyệt chạy được bộ trích đặc trưng: cần Web Worker dạng module và WebAssembly.
export const canRunModel = () => typeof Worker !== "undefined" && typeof WebAssembly !== "undefined";

class Embedder {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private loading: Promise<LoadInfo> | null = null;
  private listeners = new Set<(progress: LoadProgress) => void>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker("/image-search/worker.js", { type: "module", name: "image-search" });
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
      const error = new Error(event.message || "Không chạy được bộ trích đặc trưng.");
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

  // Tải mô hình (lần đầu theo dõi được tiến độ). Gọi nhiều lần chỉ tải một lần.
  load(onProgress?: (progress: LoadProgress) => void): Promise<LoadInfo> {
    if (onProgress) this.listeners.add(onProgress);
    if (!this.loading) {
      this.loading = this.call<{ cached: boolean; ms: number }>(
        { type: "load", urls: absoluteUrls(), key: IMAGE_SEARCH_MODEL.id },
        [],
        (progress) => this.listeners.forEach((listener) => listener(progress)),
      ).then(
        ({ cached, ms }) => ({ cached, ms }),
        (error: Error) => {
          this.loading = null;
          throw error;
        },
      );
    }
    return this.loading.finally(() => {
      if (onProgress) this.listeners.delete(onProgress);
    });
  }

  // Mỗi phần tử là điểm ảnh RGBA size × size. Trả về vector đặc trưng đã chuẩn hoá L2, cùng thứ tự.
  async embedPixels(images: readonly Uint8ClampedArray[]): Promise<Float32Array[]> {
    await this.load();
    const size = IMAGE_SEARCH_MODEL.size;
    const out: Float32Array[] = [];
    for (let start = 0; start < images.length; start += BATCH) {
      const batch = images.slice(start, start + BATCH);
      const tensor = new Float32Array(batch.length * 3 * size * size);
      batch.forEach((pixels, index) => pixelsToTensor(pixels, size, IMAGE_SEARCH_MODEL, tensor, index * 3 * size * size));
      const result = await this.call<{ data: Float32Array; dim: number }>({ type: "embed", data: tensor, count: batch.length, size }, [tensor.buffer]);
      if (result.dim !== IMAGE_SEARCH_MODEL.dim) throw new Error(`Mô hình trả về ${result.dim} chiều, cần ${IMAGE_SEARCH_MODEL.dim}.`);
      for (let i = 0; i < batch.length; i++) out.push(l2Normalize(result.data.subarray(i * result.dim, (i + 1) * result.dim)));
    }
    return out;
  }
}

let shared: Embedder | null = null;

export function getEmbedder(): Embedder {
  shared ??= new Embedder();
  return shared;
}
