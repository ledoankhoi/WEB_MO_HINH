// Dữ liệu cấu trúc schema.org Product cho trang sản phẩm (docs/ke-hoach/nghiep-vu-ban-hang.md mục 20): tên, ảnh, SKU, giá,
// tình trạng hàng, điểm đánh giá. Google đọc để hiện giá, sao trong kết quả tìm kiếm.
import type { Product } from "./types";

export function productJsonLd(
  product: Pick<Product, "name" | "slug" | "tagline" | "description" | "image" | "images" | "price" | "stock" | "variants">,
  reviews: { average: number; count: number },
  siteUrl: string,
): Record<string, unknown> {
  const variant = product.variants.find((v) => v.isDefault && v.isActive) ?? product.variants.find((v) => v.isActive);
  const availability = variant?.preorder
    ? "https://schema.org/PreOrder"
    : product.stock > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";
  const images = [product.image, ...product.images.map((image) => image.url)].filter((url): url is string => !!url);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: (product.tagline || product.description).slice(0, 500),
    ...(images.length > 0 ? { image: [...new Set(images)].slice(0, 5) } : {}),
    ...(variant ? { sku: variant.sku } : {}),
    url: `${siteUrl}/san-pham/${product.slug}`,
    offers: {
      "@type": "Offer",
      priceCurrency: "VND",
      price: product.price,
      availability,
      url: `${siteUrl}/san-pham/${product.slug}`,
    },
    ...(reviews.count > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count } } : {}),
  };
}

// Chuỗi JSON an toàn để nhúng trong <script>: thoát "<" để nội dung (tên, mô tả) không đóng thẻ script.
export const jsonLdScript = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
