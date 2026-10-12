import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SortValue } from "@/lib/catalog";
import type { Product, ProductSummary } from "@/lib/types";
import {
  countProductsByCategory,
  findProductBySlug,
  listActiveSlugs,
  listFeaturedProducts,
  listRelatedProducts,
  queryProducts,
} from "./repo/products";

// Mọi dữ liệu danh mục hiển thị cho khách đều gắn thẻ này. Khi sản phẩm hoặc tồn kho thay đổi,
// Server Action gọi updateTag(PRODUCTS_TAG) để trang được dựng lại.
export const PRODUCTS_TAG = "products";

export async function getProductBySlug(slug: string): Promise<Product | null> {
  "use cache";
  cacheTag(PRODUCTS_TAG);
  const product = await findProductBySlug(slug);
  if (!product?.isActive) {
    // Đường dẫn sai chỉ cần nhớ trong thời gian ngắn.
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  return product;
}

export async function searchProducts(query: {
  q: string;
  category: string;
  sort: SortValue;
  page: number;
  pageSize: number;
}): Promise<{ items: ProductSummary[]; total: number }> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return queryProducts({
    q: query.q || undefined,
    category: query.category || undefined,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  });
}

export async function getFeaturedProducts(limit: number): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listFeaturedProducts(limit);
}

export async function getRelatedProducts(category: string, excludeId: string, limit: number): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listRelatedProducts(category, excludeId, limit);
}

export async function getProductSlugs(): Promise<{ slug: string; updatedAt: number }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listActiveSlugs();
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return countProductsByCategory();
}
