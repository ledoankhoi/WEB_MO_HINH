import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { CATEGORIES } from "@/lib/catalog";
import { getProductSlugs, getPublishedNews } from "@/server/catalog";

// sitemap.xml (nghiep-vu-ban-hang mục 20): trang cố định, danh mục, mọi sản phẩm đang bán và tin tức đã xuất bản. Dữ liệu
// lấy qua các hàm có cache (PRODUCTS_TAG, CONTENT_TAG) nên tự cập nhật khi sản phẩm, tin tức đổi. Địa chỉ tuyệt đối theo
// NEXT_PUBLIC_SITE_URL (site.url).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, news] = await Promise.all([getProductSlugs(), getPublishedNews()]);
  const fixed = ["", "/san-pham", "/hang-sap-ve", "/trung-bay", "/tin-tuc", "/cong-dong", "/truyen-tranh", "/gacha", "/nhiem-vu"];
  return [
    ...fixed.map((path) => ({ url: `${site.url}${path}`, changeFrequency: "daily" as const, priority: path === "" ? 1 : 0.6 })),
    ...CATEGORIES.map((category) => ({ url: `${site.url}/san-pham?loai=${category.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...products.map((product) => ({ url: `${site.url}/san-pham/${product.slug}`, lastModified: new Date(product.updatedAt), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...news.map((post) => ({ url: `${site.url}/tin-tuc/${post.slug}`, lastModified: new Date(post.updatedAt), changeFrequency: "monthly" as const, priority: 0.5 })),
  ];
}
