import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { SortValue } from "@/lib/catalog";
import type { Product, ProductSummary } from "@/lib/types";
import { activeAnnouncement, findPublishedPage, getSettings, listActiveBanners, listNavItems, type InfoPage, type AnnouncementSettings, type Banner, type NavItem, type SiteSettings } from "./repo/content";
import {
  countProductsByCategory,
  findProductBySlug,
  listActiveSlugs,
  listFeaturedProducts,
  listRelatedProducts,
  queryProducts,
} from "./repo/products";
import { listApprovedReviews } from "./repo/reviews";

// Mọi dữ liệu danh mục hiển thị cho khách đều gắn thẻ này. Khi sản phẩm hoặc tồn kho thay đổi,
// Server Action gọi updateTag(PRODUCTS_TAG) để trang được dựng lại.
export const PRODUCTS_TAG = "products";
// Nội dung cửa hàng (banner, menu, trang, cài đặt hiển thị); ghi xong gọi updateTag(CONTENT_TAG).
export const CONTENT_TAG = "content";

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

// Đánh giá đã duyệt của một sản phẩm; duyệt, ẩn xong gọi updateTag(PRODUCTS_TAG).
export async function getProductReviews(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listApprovedReviews(productId);
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

// Banner đang hiệu lực. Cache theo phút nên banner hết hạn có thể còn hiện thêm vài phút (Q21).
export async function getActiveBanners(): Promise<Banner[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CONTENT_TAG);
  return listActiveBanners();
}

// Menu đầu trang và chân trang đang bật.
export async function getNavigation(): Promise<{ header: NavItem[]; footer: NavItem[] }> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  const items = (await listNavItems()).filter((item) => item.isActive);
  return { header: items.filter((item) => item.menu === "header"), footer: items.filter((item) => item.menu === "footer") };
}

export async function getSiteSettings(): Promise<SiteSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return getSettings();
}

// Thanh thông báo có khung giờ nên cache theo phút như banner (Q21).
export async function getAnnouncement(): Promise<AnnouncementSettings | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(CONTENT_TAG);
  return activeAnnouncement();
}

export async function getPublishedPage(slug: string): Promise<InfoPage | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return findPublishedPage(slug);
}
