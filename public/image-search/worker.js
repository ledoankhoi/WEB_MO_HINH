// Worker trích đặc trưng ảnh cho tính năng tìm kiếm bằng ảnh (docs/chuan/08-tich-hop-ai.md).
// Chạy ngoài luồng giao diện: tải mô hình ONNX (có lưu đệm), tạo phiên ONNX Runtime Web (WASM, một luồng)
// và biến các tensor ảnh đã tiền xử lý thành vector đặc trưng. File JS thuần, không qua bundler của Next.js;
// thư viện ONNX Runtime do scripts/copy-ort.mjs chép vào ./ort/.
import * as ort from "./ort/ort.wasm.bundle.min.mjs";

// Chỉ khai báo file .wasm: phần JS nối với WebAssembly đã nằm sẵn trong bản bundle.
ort.env.wasm.wasmPaths = { wasm: new URL("./ort/ort-wasm-simd-threaded.wasm", import.meta.url).href };
// Đa luồng cần trang được cách ly nguồn gốc (COOP/COEP); cửa hàng không bật nên chạy một luồng.
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";

const CACHE_NAME = "robotica-image-search-v1";
let session = null;
let loadedKey = "";
let inputName = "";
let outputName = "";

const post = (message, transfer) => self.postMessage(message, transfer ?? []);

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    // Trình duyệt chặn bộ nhớ đệm (cửa sổ ẩn danh...) thì tải lại mỗi lần.
    return null;
  }
}

// Tải một phần của mô hình, báo tiến độ theo byte. Có trong bộ nhớ đệm thì đọc từ đó.
async function fetchPart(url, cache, onBytes) {
  const cached = cache ? await cache.match(url).catch(() => null) : null;
  if (cached) {
    const buffer = new Uint8Array(await cached.arrayBuffer());
    onBytes(buffer.byteLength, buffer.byteLength, true);
    return buffer;
  }
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Không tải được mô hình (${response.status}) từ ${url}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onBytes(received, total, false);
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (cache) await cache.put(url, new Response(buffer, { headers: { "Content-Type": "application/octet-stream" } })).catch(() => {});
  return buffer;
}

async function load({ id, urls, key }) {
  if (session && loadedKey === key) {
    post({ id, type: "loaded", cached: true, ms: 0, inputName, outputName });
    return;
  }
  const started = performance.now();
  const cache = await openCache();
  const progress = new Array(urls.length).fill(0);
  const totals = new Array(urls.length).fill(0);
  let fromCache = true;
  const parts = await Promise.all(
    urls.map((url, index) =>
      fetchPart(url, cache, (loaded, total, hit) => {
        progress[index] = loaded;
        totals[index] = total;
        fromCache &&= hit;
        post({ id, type: "progress", loaded: progress.reduce((a, b) => a + b, 0), total: totals.every(Boolean) ? totals.reduce((a, b) => a + b, 0) : 0 });
      }),
    ),
  );
  // Mô hình có thể được chia thành nhiều phần (nơi lưu giới hạn cỡ file): ghép lại đúng thứ tự.
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = parts.length === 1 ? parts[0] : new Uint8Array(size);
  if (parts.length > 1) {
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
  }
  post({ id, type: "progress", loaded: size, total: size, stage: "init" });
  session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
  loadedKey = key;
  inputName = session.inputNames[0];
  // Bản xuất từ Hugging Face Optimum có thêm đầu ra last_hidden_state; vector cần dùng là image_embeds.
  outputName = session.outputNames.includes("image_embeds") ? "image_embeds" : session.outputNames[0];
  post({ id, type: "loaded", cached: fromCache, bytes: size, ms: Math.round(performance.now() - started), inputName, outputName });
}

async function embed({ id, data, count, size }) {
  if (!session) throw new Error("Mô hình chưa được nạp.");
  const started = performance.now();
  const input = new ort.Tensor("float32", data, [count, 3, size, size]);
  const output = await session.run({ [inputName]: input });
  const tensor = output[outputName];
  const result = new Float32Array(tensor.data);
  for (const value of Object.values(output)) value.dispose?.();
  input.dispose?.();
  post({ id, type: "embedded", data: result, dim: tensor.dims[tensor.dims.length - 1], ms: Math.round(performance.now() - started) }, [result.buffer]);
}

self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === "load") await load(message);
    else if (message.type === "embed") await embed(message);
    else throw new Error(`Lệnh không hợp lệ: ${message.type}`);
  } catch (error) {
    post({ id: message.id, type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
