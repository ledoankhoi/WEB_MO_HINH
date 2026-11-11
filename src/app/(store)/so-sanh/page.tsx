import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductCard";
import { CompareRemove } from "@/components/product/CompareRemove";
import { CompareEmpty } from "@/components/product/CompareEmpty";
import { site } from "@/config/site";
import { PRODUCT_TYPE_LABELS, getCategory } from "@/lib/catalog";
import { formatDate, formatVnd } from "@/lib/format";
import { orderableQty } from "@/lib/preorder";
import { getProductBySlug, getProductReviews, getTaxonomyNames } from "@/server/catalog";

export const metadata: Metadata = { title: "So sánh sản phẩm", robots: { index: false } };

const MAX = 4;

// Bảng so sánh tối đa 4 sản phẩm (nghiep-vu-ban-hang mục 19): giá, phân loại, tình trạng, đánh giá và mọi dòng thông số.
async function CompareTable({ searchParams }: { searchParams: PageProps<"/so-sanh">["searchParams"] }) {
  const raw = (await searchParams).sp;
  const slugs = [...new Set(String(Array.isArray(raw) ? raw[0] : (raw ?? "")).split(",").filter((slug) => /^[a-z0-9-]{1,120}$/.test(slug)))].slice(0, MAX);
  const products = (await Promise.all(slugs.map((slug) => getProductBySlug(slug)))).filter((product) => product !== null);
  if (products.length === 0) return <CompareEmpty />;
  const [names, reviews] = await Promise.all([getTaxonomyNames(), Promise.all(products.map((product) => getProductReviews(product.id)))]);
  const shown = products.map((product) => product.slug);
  // Mọi nhãn thông số xuất hiện ở ít nhất một sản phẩm, theo thứ tự gặp.
  const specLabels = [...new Set(products.flatMap((product) => product.specs.map((spec) => spec.label)))];

  const rows: { label: string; values: React.ReactNode[] }[] = [
    {
      label: "Giá",
      values: products.map((product) => (
        <span key={product.id} className="font-semibold tabular-nums">
          {formatVnd(product.price)}
          {product.compareAtPrice !== null && product.compareAtPrice > product.price && (
            <span className="ml-1.5 text-xs font-normal text-muted line-through">{formatVnd(product.compareAtPrice)}</span>
          )}
        </span>
      )),
    },
    { label: "Danh mục", values: products.map((product) => getCategory(product.category)?.name ?? "—") },
    { label: "Thương hiệu", values: products.map((product) => (product.brandId ? (names[product.brandId] ?? "—") : "—")) },
    { label: "Series", values: products.map((product) => (product.seriesId ? (names[product.seriesId] ?? "—") : "—")) },
    { label: "Loại", values: products.map((product) => PRODUCT_TYPE_LABELS[product.productType]) },
    { label: "Tỉ lệ", values: products.map((product) => product.scale || "—") },
    { label: "Cấp độ", values: products.map((product) => product.grade || "—") },
    {
      label: "Tình trạng",
      values: products.map((product) => {
        const variant = product.variants.find((v) => v.isDefault && v.isActive);
        if (variant?.preorder) return `Đặt trước, về ${formatDate(variant.preorder.expectedAt)}`;
        return product.stock > 0 ? `Còn hàng (${product.stock})` : "Hết hàng";
      }),
    },
    {
      label: "Đánh giá",
      values: reviews.map((review, index) => (review.count > 0 ? `${review.average.toLocaleString("vi-VN")}/5 · ${review.count} đánh giá` : <span key={index} className="text-muted">Chưa có</span>)),
    },
    ...specLabels.map((label) => ({ label, values: products.map((product) => product.specs.find((spec) => spec.label === label)?.value ?? "—") })),
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-[40rem] text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3">
        <thead>
          <tr>
            <th scope="col" className="w-36 text-muted">
              Sản phẩm
            </th>
            {products.map((product) => {
              const variant = product.variants.find((v) => v.isDefault && v.isActive);
              return (
                <th key={product.id} scope="col" className="align-top font-normal">
                  <div className="flex justify-end">
                    <CompareRemove slug={product.slug} slugs={shown} name={product.name} />
                  </div>
                  <Link href={`/san-pham/${product.slug}`} className="block space-y-2 hover:text-brand">
                    <ProductImage src={product.image} alt="" className="product-stage aspect-square w-full rounded-xl p-2" />
                    <span className="block font-semibold">{product.name}</span>
                  </Link>
                  {variant && (
                    <div className="mt-2">
                      <AddToCartButton
                        id={variant.id}
                        name={product.name}
                        stock={orderableQty(variant.stock, variant.preorder, site.maxQtyPerItem)}
                        preorder={!!variant.preorder}
                        label={variant.preorder ? "Đặt trước" : "Thêm vào giỏ"}
                        full
                      />
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="border-t border-line align-top font-medium text-muted">
                {row.label}
              </th>
              {row.values.map((value, index) => (
                <td key={index} className="align-top">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage({ searchParams }: PageProps<"/so-sanh">) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">So sánh sản phẩm</h1>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải...</p>}>
        <CompareTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
