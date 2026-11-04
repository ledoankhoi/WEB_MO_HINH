// Dựng ảnh từ mô hình 3D rồi trích đặc trưng, dùng cho lập chỉ mục và hiệu chỉnh ở trang quản trị
// (YC-AI-05, 06). Chạy ở trình duyệt của quản trị: một khung vẽ WebGL và một worker mô hình dùng chung.
// Phép tính chấm điểm nằm ở src/lib/image-search-eval.ts.
import { FORM_KEYS, decodeVector, indexViews, queryViews, seededRandom, type FormKey, type ViewSpec } from "@/lib/image-search";
import { productSeed, scoreQuery, splitOf, type GalleryEntry, type QueryRecord } from "@/lib/image-search-eval";
import { getEmbedder } from "./embedder";
import { toModelInput } from "./pixels";
import { ViewRenderer, type LoadedModel } from "./view-renderer";

// Nhường luồng giao diện sau mỗi khung hình để ảnh xem trước kịp hiện.
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

let sharedRenderer: ViewRenderer | null = null;
function getRenderer(): ViewRenderer {
  sharedRenderer ??= new ViewRenderer(256);
  return sharedRenderer;
}

async function embedViews(model: LoadedModel, views: readonly ViewSpec[], onThumbnail?: (thumbnail: string, index: number) => void) {
  const renderer = getRenderer();
  const pixels: Uint8ClampedArray[] = [];
  for (const [index, view] of views.entries()) {
    const canvas = renderer.render(model, view);
    const input = await toModelInput(canvas, undefined, view.degrade);
    pixels.push(input.pixels);
    onThumbnail?.(input.thumbnail, index);
    await nextFrame();
  }
  return getEmbedder().embedPixels(pixels);
}

export type RenderedForm = { form: FormKey; label: string; views: Float32Array[] };

// Bước 1–2 của lập chỉ mục: 12 góc thư viện cho từng dạng của mô hình, mỗi góc một vector đã chuẩn hoá.
export async function indexModel(url: string, onThumbnail?: (form: FormKey, thumbnail: string, index: number) => void): Promise<RenderedForm[]> {
  const renderer = getRenderer();
  const model = await renderer.load(url);
  try {
    const out: RenderedForm[] = [];
    for (const form of model.forms) {
      const views = await embedViews(model, indexViews(form.form), (thumbnail, index) => onThumbnail?.(form.form, thumbnail, index));
      out.push({ form: form.form, label: form.label, views });
    }
    return out;
  } finally {
    renderer.unload();
  }
}

// Chỉ mục do máy chủ gửi (vector base64) thành vector float32.
export function decodeGallery(
  entries: readonly { productId: string; name: string; modelUrl: string | null; forms: { form: FormKey; label: string; embedding: string; views: string[] }[] }[],
): GalleryEntry[] {
  return entries.map((entry) => ({
    ...entry,
    forms: entry.forms.map((form) => ({ form: form.form, label: form.label, embedding: decodeVector(form.embedding), views: form.views.map(decodeVector) })),
  }));
}

// Dựng `perProduct` ảnh truy vấn giả lập của một sản phẩm (góc, nền, ánh sáng ngẫu nhiên, làm mờ, nén JPEG),
// trích đặc trưng và chấm điểm theo cả hai cách gộp.
export async function calibrateProduct(
  owner: GalleryEntry,
  gallery: readonly GalleryEntry[],
  perProduct: number,
  seed: number,
  onThumbnail?: (thumbnail: string, index: number) => void,
): Promise<QueryRecord[]> {
  if (!owner.modelUrl) return [];
  const renderer = getRenderer();
  const model = await renderer.load(owner.modelUrl);
  try {
    const indexed = new Set(owner.forms.map((form) => form.form));
    const forms = FORM_KEYS.filter((form) => indexed.has(form) && model.forms.some((item) => item.form === form));
    if (forms.length === 0) return [];
    const views = queryViews(perProduct, forms, seededRandom(productSeed(seed, owner.productId)));
    const vectors = await embedViews(model, views, onThumbnail);
    return vectors.flatMap((vector, index) =>
      (["mean", "maxview"] as const).map((pooling) => ({
        productId: owner.productId,
        name: owner.name,
        form: views[index].form,
        index,
        split: splitOf(index),
        pooling,
        ...scoreQuery(vector, owner.productId, gallery, pooling),
      })),
    );
  } finally {
    renderer.unload();
  }
}
