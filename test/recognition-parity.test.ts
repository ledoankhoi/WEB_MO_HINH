import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareImage, toTensor } from "@/lib/recognition-preprocess";

// B11: kiểm tra khớp Python – trình duyệt trên 20 ảnh thật, cùng file ONNX của B9 và cùng ONNX Runtime Web (WASM, một luồng)
// như worker của trình duyệt. Dữ liệu sinh bởi ml/scripts/b11_kiem_tra_khop.py (ảnh không vào git), nên test chỉ chạy khi có
// RECOGNITION_PARITY_DIR. Ghi kết quả vào <thư mục>/ket-qua-web.json cho báo cáo B11.
const dir = process.env.RECOGNITION_PARITY_DIR;

type Case = { file: string; width: number; height: number; label: string; domain: string; logits_torch: number[]; logits_onnx: number[] };
type Parity = { model: string; variant: string; parts: string[]; input: { size: number; resize: number; mean: [number, number, number]; std: [number, number, number] }; images: Case[] };

const argmax = (values: ArrayLike<number>) => {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
  return best;
};
const maxAbsDiff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
};

describe.skipIf(!dir)("khớp Python – ONNX Runtime Web trên ảnh thật", () => {
  it("top-1 trùng 100%, ghi chênh lệch logits và thời gian", { timeout: 600_000 }, async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    const parity = JSON.parse(readFileSync(join(dir!, "khop.json"), "utf-8")) as Parity;
    const bytes = Buffer.concat(parity.parts.map((part) => readFileSync(part)));
    const loadStarted = performance.now();
    const session = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const loadMs = performance.now() - loadStarted;
    const rows = [];
    for (const c of parity.images) {
      const rgb = { data: new Uint8Array(readFileSync(join(dir!, c.file))), width: c.width, height: c.height };
      const prepStarted = performance.now();
      const tensor = toTensor(prepareImage(rgb, parity.input), parity.input.mean, parity.input.std);
      const prepMs = performance.now() - prepStarted;
      const runStarted = performance.now();
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", tensor, [1, 3, parity.input.size, parity.input.size]) });
      const runMs = performance.now() - runStarted;
      const logits = output[session.outputNames[0]].data as Float32Array;
      rows.push({
        file: c.file,
        label: c.label,
        domain: c.domain,
        top1Web: argmax(logits),
        top1Onnx: argmax(c.logits_onnx),
        top1Torch: argmax(c.logits_torch),
        diffOnnx: maxAbsDiff(logits, c.logits_onnx),
        diffTorch: maxAbsDiff(logits, c.logits_torch),
        prepMs,
        runMs,
      });
    }
    const agreeOnnx = rows.filter((r) => r.top1Web === r.top1Onnx).length;
    const agreeTorch = rows.filter((r) => r.top1Web === r.top1Torch).length;
    const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
    const quantile = (xs: number[], q: number) => sorted(xs)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
    const summary = {
      model: parity.model,
      variant: parity.variant,
      images: rows.length,
      agreeOnnx,
      agreeTorch,
      maxDiffOnnx: Math.max(...rows.map((r) => r.diffOnnx)),
      maxDiffTorch: Math.max(...rows.map((r) => r.diffTorch)),
      loadMs,
      prepMsMedian: quantile(rows.map((r) => r.prepMs), 0.5),
      runMsMedian: quantile(rows.slice(1).map((r) => r.runMs), 0.5), // bỏ lần đầu (khởi động)
      runMsP95: quantile(rows.slice(1).map((r) => r.runMs), 0.95),
      runtime: `onnxruntime-web ${ort.env.versions?.web ?? ""} (wasm, 1 luồng, Node ${process.version})`,
      rows,
    };
    writeFileSync(join(dir!, "ket-qua-web.json"), JSON.stringify(summary, null, 1));
    expect(agreeOnnx).toBe(rows.length);
  });
});
