// Chuyển ảnh (ảnh khách tải lên hoặc khung hình dựng từ mô hình 3D) thành điểm ảnh RGBA đúng cỡ đầu vào của
// mô hình, theo cách CLIP: lấy hình vuông lớn nhất ở giữa vùng đã chọn rồi thu về size × size. Chỉ dùng ở client.
import { IMAGE_SEARCH_MODEL, centerSquare, type Degrade } from "@/lib/image-search";

export type Rect = { x: number; y: number; width: number; height: number };

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Trình duyệt không hỗ trợ canvas 2D.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không mã hoá được ảnh."))), type, quality));

export type ModelInput = { pixels: Uint8ClampedArray; thumbnail: string };

// `region` tính trên ảnh gốc; mặc định cả ảnh. `degrade` (chỉ dùng khi hiệu chỉnh) cắt lệch, làm mờ, đổi sáng,
// tương phản và nén JPEG để giống ảnh chụp điện thoại.
export async function toModelInput(
  source: CanvasImageSource & { width: number; height: number },
  region: Rect = { x: 0, y: 0, width: source.width, height: source.height },
  degrade?: Degrade,
  thumbnailSize = 72,
): Promise<ModelInput> {
  const size = IMAGE_SEARCH_MODEL.size;
  let area = region;
  if (degrade) {
    const keep = 1 - degrade.crop;
    area = { x: region.x + region.width * (1 - keep) * degrade.cropX, y: region.y + region.height * (1 - keep) * degrade.cropY, width: region.width * keep, height: region.height * keep };
  }
  const square = centerSquare(area);
  const { canvas, context } = canvas2d(size, size);
  if (degrade) context.filter = `blur(${degrade.blur.toFixed(2)}px) brightness(${degrade.brightness.toFixed(3)}) contrast(${degrade.contrast.toFixed(3)})`;
  context.drawImage(source, square.x, square.y, square.width, square.height, 0, 0, size, size);
  context.filter = "none";
  if (degrade) {
    const jpeg = await createImageBitmap(await encode(canvas, "image/jpeg", degrade.jpeg));
    context.drawImage(jpeg, 0, 0, size, size);
    jpeg.close();
  }
  const pixels = context.getImageData(0, 0, size, size).data;
  const thumb = canvas2d(thumbnailSize, thumbnailSize);
  thumb.context.drawImage(canvas, 0, 0, thumbnailSize, thumbnailSize);
  return { pixels, thumbnail: thumb.canvas.toDataURL("image/webp", 0.7) };
}

// Ảnh khách chọn: giải mã theo đúng chiều chụp (EXIF) và thu nhỏ cạnh dài về tối đa `maxSide` điểm ảnh để vẽ
// và chọn vùng nhanh. Trả về canvas để dùng lại khi khách đổi vùng chọn.
export async function readImageFile(file: Blob, maxSide = 1600): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const { canvas, context } = canvas2d(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
