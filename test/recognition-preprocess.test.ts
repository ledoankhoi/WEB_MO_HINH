import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/recognition-preprocess.json";
import { centerCrop, prepareImage, resizeBilinear, rgbaToRgb, shortSideSize, toTensor, type Rgb } from "@/lib/recognition-preprocess";

// Ảnh mẫu sinh lại y hệt make_image() của ml/scripts/xuat_mau_tien_xu_ly.py.
function makeImage(width: number, height: number, kind: string, seed: number): Rgb {
  const data = new Uint8Array(width * height * 3);
  if (kind === "pattern") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) data[(y * width + x) * 3 + c] = (x * x * 3 + y * 7 + c * 85 + ((x * 31) ^ (y * 17)) + seed) & 255;
      }
    }
  } else {
    let state = seed >>> 0;
    for (let i = 0; i < data.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = state >>> 24;
    }
  }
  return { data, width, height };
}

const { input } = fixture;
const mean = input.mean as [number, number, number];
const std = input.std as [number, number, number];

describe("tiền xử lý ảnh nhận dạng giống torchvision + Pillow", () => {
  for (const c of fixture.cases) {
    it(`${c.kind} ${c.width}×${c.height}`, () => {
      const image = makeImage(c.width, c.height, c.kind, c.seed);
      expect(shortSideSize(c.width, c.height, input.resize)).toEqual({ width: c.resized[0], height: c.resized[1] });
      const prepared = prepareImage(image, input);
      expect(createHash("sha256").update(prepared.data).digest("hex")).toBe(c.sha256);
      const tensor = toTensor(prepared, mean, std);
      const plane = input.size * input.size;
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let i = 0; i < plane; i++) sum += tensor[ch * plane + i];
        expect(Math.abs(sum - c.tensor.sum[ch])).toBeLessThan(0.05); // 50 nghìn số float32: sai số cộng dồn nhỏ
      }
      for (const [index, value] of c.tensor.picks) expect(tensor[index]).toBeCloseTo(value, 5);
    });
  }

  it("giữ nguyên ảnh khi không đổi cỡ, cắt giữa làm tròn nửa về số chẵn", () => {
    const image = makeImage(5, 4, "noise", 9);
    expect(resizeBilinear(image, 5, 4)).toBe(image);
    // (5 − 2) / 2 = 1,5 → 2 (Python round), (4 − 2) / 2 = 1
    const crop = centerCrop(image, 2);
    expect(Array.from(crop.data.slice(0, 3))).toEqual(Array.from(image.data.slice((1 * 5 + 2) * 3, (1 * 5 + 2) * 3 + 3)));
  });

  it("trộn điểm ảnh trong suốt lên nền trắng", () => {
    const rgb = rgbaToRgb([10, 20, 30, 255, 0, 0, 0, 0, 200, 100, 0, 128], 3, 1);
    expect(Array.from(rgb.data)).toEqual([10, 20, 30, 255, 255, 255, 227, 177, 127]);
  });
});
