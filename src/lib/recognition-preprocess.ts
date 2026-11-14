// Tiền xử lý ảnh cho mô hình nhận dạng robot (B11), giống hệt val/test lúc huấn luyện (ml/robotrec/train.py, transforms_for):
//   torchvision Resize(resize, BILINEAR) trên ảnh PIL → CenterCrop(size) → ToTensor → Normalize(mean, std).
// Phép thu nhỏ chép thuật toán song tuyến của Pillow (Resample.c, ảnh 8 bit): lọc tam giác có giãn theo tỉ lệ (chống răng cưa),
// hệ số dạng số nguyên 22 bit, làm tròn về 8 bit sau mỗi chiều (ngang trước, dọc sau). Nhờ vậy trình duyệt và Python cho cùng
// từng điểm ảnh khi cùng ảnh đầu vào (test/recognition-preprocess.test.ts so với bộ ca sinh bằng Python).
// Hàm thuần, không dùng DOM: ảnh vào là RGBA (ImageData.data) đã giải mã.

const PRECISION_BITS = 32 - 8 - 2;
const ONE = 2 ** PRECISION_BITS;
const HALF = 2 ** (PRECISION_BITS - 1);
const CLIP_MAX = ONE * 256;

export type Rgb = { data: Uint8Array; width: number; height: number }; // 3 byte mỗi điểm ảnh, theo hàng

const triangle = (x: number) => {
  const a = Math.abs(x);
  return a < 1 ? 1 - a : 0;
};

// Hệ số lọc cho một chiều: với mỗi điểm ra, đoạn [start, start + count) của chiều vào và trọng số số nguyên tương ứng.
function coefficients(inSize: number, outSize: number) {
  const scale = inSize / outSize;
  const filterScale = Math.max(scale, 1);
  const support = filterScale; // support của bộ lọc song tuyến là 1
  const ss = 1 / filterScale;
  const start = new Int32Array(outSize);
  const count = new Int32Array(outSize);
  const weights: Int32Array[] = [];
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    const k = new Float64Array(xmax);
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      k[x] = triangle((x + xmin - center + 0.5) * ss);
      ww += k[x];
    }
    const kk = new Int32Array(xmax);
    for (let x = 0; x < xmax; x++) {
      const w = ww !== 0 ? k[x] / ww : k[x];
      kk[x] = w < 0 ? Math.trunc(-0.5 + w * ONE) : Math.trunc(0.5 + w * ONE);
    }
    start[xx] = xmin;
    count[xx] = xmax;
    weights.push(kk);
  }
  return { start, count, weights };
}

const clip8 = (value: number) => (value >= CLIP_MAX ? 255 : value <= 0 ? 0 : Math.floor(value / ONE));

function resizeHorizontal(src: Rgb, outWidth: number): Rgb {
  if (outWidth === src.width) return src;
  const { start, count, weights } = coefficients(src.width, outWidth);
  const out = new Uint8Array(outWidth * src.height * 3);
  for (let y = 0; y < src.height; y++) {
    const row = y * src.width * 3;
    for (let xx = 0; xx < outWidth; xx++) {
      const k = weights[xx];
      let r = HALF;
      let g = HALF;
      let b = HALF;
      for (let x = 0; x < count[xx]; x++) {
        const p = row + (start[xx] + x) * 3;
        r += src.data[p] * k[x];
        g += src.data[p + 1] * k[x];
        b += src.data[p + 2] * k[x];
      }
      const o = (y * outWidth + xx) * 3;
      out[o] = clip8(r);
      out[o + 1] = clip8(g);
      out[o + 2] = clip8(b);
    }
  }
  return { data: out, width: outWidth, height: src.height };
}

function resizeVertical(src: Rgb, outHeight: number): Rgb {
  if (outHeight === src.height) return src;
  const { start, count, weights } = coefficients(src.height, outHeight);
  const out = new Uint8Array(src.width * outHeight * 3);
  for (let yy = 0; yy < outHeight; yy++) {
    const k = weights[yy];
    for (let x = 0; x < src.width; x++) {
      let r = HALF;
      let g = HALF;
      let b = HALF;
      for (let y = 0; y < count[yy]; y++) {
        const p = ((start[yy] + y) * src.width + x) * 3;
        r += src.data[p] * k[y];
        g += src.data[p + 1] * k[y];
        b += src.data[p + 2] * k[y];
      }
      const o = (yy * src.width + x) * 3;
      out[o] = clip8(r);
      out[o + 1] = clip8(g);
      out[o + 2] = clip8(b);
    }
  }
  return { data: out, width: src.width, height: outHeight };
}

// Pillow Image.resize((w, h), BILINEAR) cho ảnh RGB.
export function resizeBilinear(src: Rgb, width: number, height: number): Rgb {
  return resizeVertical(resizeHorizontal(src, width), height);
}

// Cỡ ảnh sau torchvision Resize(n) với n là số nguyên: cạnh ngắn về n, cạnh dài = int(n · dài / ngắn).
export function shortSideSize(width: number, height: number, short: number): { width: number; height: number } {
  if (width <= height) return { width: short, height: Math.trunc((short * height) / width) };
  return { width: Math.trunc((short * width) / height), height: short };
}

// round() của Python: nửa thì về số chẵn.
const roundHalfEven = (x: number) => {
  const f = Math.floor(x);
  const d = x - f;
  return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f;
};

// torchvision CenterCrop(size): lề trên = int(round((h − size) / 2)), lề trái tương tự. Ảnh nhỏ hơn size thì độn 0 (như torchvision).
export function centerCrop(src: Rgb, size: number): Rgb {
  const out = new Uint8Array(size * size * 3);
  const top = roundHalfEven((src.height - size) / 2);
  const left = roundHalfEven((src.width - size) / 2);
  for (let y = 0; y < size; y++) {
    const sy = y + top;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < size; x++) {
      const sx = x + left;
      if (sx < 0 || sx >= src.width) continue;
      const s = (sy * src.width + sx) * 3;
      const o = (y * size + x) * 3;
      out[o] = src.data[s];
      out[o + 1] = src.data[s + 1];
      out[o + 2] = src.data[s + 2];
    }
  }
  return { data: out, width: size, height: size };
}

// RGBA → RGB. Điểm ảnh trong suốt được trộn lên nền trắng, giống ảnh huấn luyện (ml/robotrec/fetch.py dán PNG có kênh alpha lên nền trắng).
export function rgbaToRgb(rgba: ArrayLike<number>, width: number, height: number): Rgb {
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height * 4; i += 4, j += 3) {
    const a = rgba[i + 3];
    if (a === 255) {
      out[j] = rgba[i];
      out[j + 1] = rgba[i + 1];
      out[j + 2] = rgba[i + 2];
    } else {
      out[j] = Math.round((rgba[i] * a + 255 * (255 - a)) / 255);
      out[j + 1] = Math.round((rgba[i + 1] * a + 255 * (255 - a)) / 255);
      out[j + 2] = Math.round((rgba[i + 2] * a + 255 * (255 - a)) / 255);
    }
  }
  return { data: out, width, height };
}

// Thu cạnh ngắn về `resize`, cắt giữa `size` (ảnh 8 bit, trước khi chuẩn hoá).
export function prepareImage(src: Rgb, input: { size: number; resize: number }): Rgb {
  const target = shortSideSize(src.width, src.height, input.resize);
  return centerCrop(resizeBilinear(src, target.width, target.height), input.size);
}

// ToTensor + Normalize: tensor float32 dạng [3, size, size] (kênh trước), (x / 255 − mean) / std.
export function toTensor(
  img: Rgb,
  mean: readonly [number, number, number],
  std: readonly [number, number, number],
  out = new Float32Array(3 * img.width * img.height),
  offset = 0,
): Float32Array {
  const plane = img.width * img.height;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[offset + c * plane + i] = (img.data[i * 3 + c] / 255 - mean[c]) / std[c];
  }
  return out;
}
