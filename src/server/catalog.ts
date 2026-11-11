import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { CATEGORIES, type SortValue } from "@/lib/catalog";
import { suggestTerms, type SearchSuggestions } from "@/lib/search-suggest";
import type { Product, ProductSummary } from "@/lib/types";
import { activeAnnouncement, findPublishedPage, getSettings, listActiveBanners, listNavItems, type InfoPage, type AnnouncementSettings, type Banner, type NavItem, type SiteSettings } from "./repo/content";
import {
  countProductsByCategory,
  findProductBySlug,
  listActiveSlugs,
  listCategoryMenuData,
  listFeaturedProducts,
  listFilterOptions,
  listMedia,
  listRelatedProducts,
  listSummariesBySlugs,
  queryProducts,
  type MenuFacet,
} from "./repo/products";
import { findPublishedNews, listPublishedNews, type NewsPost, type NewsSummary } from "./repo/news";
import { listComingProducts, type ComingProduct } from "./repo/preorders";
import { listPublicQuestions } from "./repo/questions";
import { listDealsForProducts } from "./repo/bundles";
import { listTaxonomy } from "./repo/taxonomy";
import { listStorefrontSales, type StorefrontSale } from "./repo/flash-sales";
import { listApprovedReviews } from "./repo/reviews";
import { getShowcaseStats, listRanking, type RankedProduct, type RankingSlug, type ShowcaseStats } from "./repo/showcase";

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

// Tên thương hiệu, series theo mã (bảng so sánh sản phẩm, mục 19); sửa ở quản trị xong gọi updateTag(PRODUCTS_TAG).
export async function getTaxonomyNames(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  const [brands, series] = await Promise.all([listTaxonomy("brands"), listTaxonomy("series")]);
  return Object.fromEntries([...brands, ...series].map((item) => [item.id, item.name]));
}

// Combo đang bật có sản phẩm này (nghiep-vu-ban-hang mục 12); lưu combo xong gọi updateTag(PRODUCTS_TAG).
export async function getProductDeals(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listDealsForProducts([productId]);
}

// Hỏi đáp đã duyệt của một sản phẩm (nghiep-vu-ban-hang mục 11); duyệt, ẩn, trả lời xong gọi updateTag(PRODUCTS_TAG).
export async function getProductQuestions(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listPublicQuestions(productId);
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
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  brand?: string;
  series?: string;
  transformable?: boolean;
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
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock || undefined,
    brand: query.brand || undefined,
    series: query.series || undefined,
    transformable: query.transformable || undefined,
  });
}

// Gợi ý trong ô tìm kiếm ở đầu trang (/api/goi-y): vài cụm từ và vài sản phẩm khớp nhất.
export async function getSearchSuggestions(q: string): Promise<SearchSuggestions> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  const { items, total } = await queryProducts({ q, sort: "noi-bat", pageSize: 30 });
  return {
    terms: suggestTerms(q, items.map((item) => item.name)),
    products: items.slice(0, 5).map(({ slug, name, category, price, image, stock, modelUrl }) => ({ slug, name, category, price, image, stock, modelUrl })),
    total,
  };
}

export type MegaMenuCategory = {
  slug: string;
  name: string;
  description: string;
  count: number;
  series: MenuFacet[];
  brands: MenuFacet[];
  transformable: number;
  featured: ProductSummary | null;
};

// Menu danh mục mở rộng ở đầu trang: các danh mục đang có hàng, theo thứ tự của CATEGORIES.
export async function getMegaMenu(): Promise<MegaMenuCategory[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  const [counts, data] = await Promise.all([countProductsByCategory(), listCategoryMenuData()]);
  return CATEGORIES.filter((category) => (counts[category.slug] ?? 0) > 0).map((category) => {
    const facets = data[category.slug];
    return {
      slug: category.slug,
      name: category.name,
      description: category.description,
      count: counts[category.slug] ?? 0,
      series: facets?.series.slice(0, 6) ?? [],
      brands: facets?.brands.slice(0, 6) ?? [],
      transformable: facets?.transformable ?? 0,
      featured: facets?.featured ?? null,
    };
  });
}

// Trang "Hàng sắp về" (/hang-sap-ve): phiên bản đang trong đợt đặt trước, về sớm trước. Mở, sửa đợt và mỗi đơn đặt
// (số suất còn lại) đều gọi updateTag(PRODUCTS_TAG).
export async function getComingProducts(): Promise<ComingProduct[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listComingProducts();
}

// Khối flash sale ở trang chủ: chương trình đang chạy hoặc sắp chạy. Lưu, bật, tắt chương trình và mỗi đơn (suất còn lại)
// đều gọi updateTag(PRODUCTS_TAG); trình duyệt tự ẩn chương trình đã hết giờ.
export async function getFlashSales(): Promise<StorefrontSale[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PRODUCTS_TAG);
  return listStorefrontSales();
}

// Phụ kiện còn hàng, rẻ trước: gợi ý "thường mua kèm" trong giỏ hàng xem nhanh.
export async function getAddOnProducts(): Promise<ProductSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return (await queryProducts({ category: "phu-kien", inStock: true, sort: "gia-tang", pageSize: 12 })).items;
}

// Ảnh phụ của sản phẩm (thư viện ảnh trong quản trị) cho dải ảnh nhỏ ở trang sản phẩm.
export async function getProductMedia(productId: string): Promise<{ url: string; alt: string }[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return (await listMedia(productId)).map(({ url, alt }) => ({ url, alt }));
}

// Lựa chọn cho cột lọc của trang cửa hàng.
export async function getFilterOptions() {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listFilterOptions();
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

// Sản phẩm theo slug, trả về dạng tra cứu (truyện tranh, gacha).
export async function getProductsBySlugs(slugs: string[]): Promise<Record<string, ProductSummary>> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return Object.fromEntries((await listSummariesBySlugs(slugs)).map((product) => [product.slug, product]));
}

// Trưng bày (/trung-bay). Số bán, lượt thích, đánh giá đổi theo đơn hàng và hoạt động của khách nên chỉ giữ tối đa vài
// giờ; sửa sản phẩm thì làm mới ngay qua PRODUCTS_TAG.
export async function getRanking(slug: RankingSlug, limit: number): Promise<RankedProduct[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return listRanking(slug, limit);
}

export async function getShowcase(): Promise<ShowcaseStats> {
  "use cache";
  cacheLife("hours");
  cacheTag(PRODUCTS_TAG);
  return getShowcaseStats();
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

// Tin tức (/tin-tuc). Ghi bài ở quản trị thì gọi updateTag(CONTENT_TAG).
export async function getPublishedNews(): Promise<NewsSummary[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return listPublishedNews();
}

export async function getNewsPost(slug: string): Promise<NewsPost | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(CONTENT_TAG);
  return findPublishedNews(slug);
}
