import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ProductSummary } from "@/lib/types";
import { PRODUCTS_TAG } from "./catalog";
import { findActiveModel, listProductsForRobots, listRobots, type ActiveRecognitionModel, type Robot } from "./repo/recognition";

// Nhận dạng robot (B11): dữ liệu công khai đọc qua cache. Nhập robot, nhập hoặc bật/tắt mô hình, ghép sản phẩm xong thì
// gọi updateTag(RECOGNITION_TAG). Sản phẩm kèm giá và tồn nên gắn thêm PRODUCTS_TAG.
export const RECOGNITION_TAG = "recognition";

// Mô hình đang bật (null: chưa bật). Lỗi CSDL thì coi như chưa bật, để trang và đầu trang không lỗi theo.
export async function getActiveRecognitionModel(): Promise<ActiveRecognitionModel | null> {
  "use cache";
  cacheTag(RECOGNITION_TAG);
  try {
    const model = await findActiveModel();
    cacheLife("hours");
    return model;
  } catch (cause) {
    console.error("[robotica] Không đọc được mô hình nhận dạng:", cause instanceof Error ? cause.message : cause);
    cacheLife("minutes");
    return null;
  }
}

export type RecognitionRobot = Omit<Robot, "productIds" | "storeProducts">;

// Mọi robot (khoảng 230) kèm sản phẩm đang bán của từng robot, theo slug. Một lần đọc cho mọi lượt nhận dạng.
export async function getRecognitionCatalog(): Promise<{ robots: Record<string, RecognitionRobot>; products: Record<string, ProductSummary[]> }> {
  "use cache";
  cacheLife("hours");
  cacheTag(RECOGNITION_TAG, PRODUCTS_TAG);
  const robots = await listRobots();
  const bySlug: Record<string, RecognitionRobot> = {};
  for (const robot of robots) {
    const { productIds, storeProducts, ...rest } = robot;
    void productIds;
    void storeProducts;
    bySlug[robot.slug] = rest;
  }
  const linked = await listProductsForRobots(robots.filter((r) => r.productIds.length > 0).map((r) => r.id));
  const products = Object.fromEntries(robots.filter((r) => linked.has(r.id)).map((r) => [r.slug, linked.get(r.id)!]));
  return { robots: bySlug, products };
}
