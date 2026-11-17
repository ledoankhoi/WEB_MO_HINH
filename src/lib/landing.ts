import { getModelFeatures, modelKey } from "@/lib/model-features";

// Trang Giới thiệu (/gioi-thieu): phép tính thuần, nội dung chữ ở src/data/landing.ts.

// Mẫu ưu tiên cho khung 3D đầu trang: biến hình xe ↔ robot rõ ràng, có nhiều dáng (tên file trong model-features.ts).
export const SHOWCASE_PREFERENCE = ["alliance-optimus-prime", "alliance-bumblebee", "alliance-megatron", "alliance-starscream"];

// Chọn sản phẩm cho khung 3D: mẫu ưu tiên đang bán, không có thì mẫu biến hình đầu tiên, rồi mẫu hợp thể, rồi mẫu
// có file .glb bất kỳ, cuối cùng là mẫu đầu danh sách (mô hình dựng bằng hình học).
export function pickShowcaseModel<T extends { modelUrl: string | null }>(items: T[], preference: readonly string[] = SHOWCASE_PREFERENCE): T | null {
  for (const key of preference) {
    const preferred = items.find((item) => modelKey(item.modelUrl) === key);
    if (preferred) return preferred;
  }
  const transform = (item: T) => getModelFeatures(item.modelUrl)?.transform;
  return (
    items.find((item) => transform(item)?.kind === "transform") ??
    items.find((item) => transform(item)) ??
    items.find((item) => modelKey(item.modelUrl)) ??
    items[0] ??
    null
  );
}

// Trang quản trị chạy ở tên miền riêng (ADMIN_HOST, src/proxy.ts): giữ giao thức và cổng của trang đang xem.
export function adminUrl(adminHost: string, location: { protocol: string; port: string }): string {
  return `${location.protocol}//${adminHost}${location.port ? `:${location.port}` : ""}/admin`;
}
