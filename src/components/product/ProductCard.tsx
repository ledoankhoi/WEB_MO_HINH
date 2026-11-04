import Image from "next/image";
import Link from "next/link";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";
import { WishlistButton } from "./WishlistButton";

// Ngưỡng tồn kho để hiện nhãn "Sắp hết hàng".
const LOW_STOCK = 3;

export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return <div className={`grid place-items-center text-sm text-muted ${className}`}>Chưa có ảnh</div>;
  }
  // Ảnh đã là WebP kích thước nhỏ nên không cần qua bộ tối ưu ảnh.
  return <Image src={src} alt={alt} width={640} height={640} unoptimized className={`object-contain ${className}`} />;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/san-pham/${product.slug}`;
  const badge = product.stock <= 0 ? "Hết hàng" : product.stock <= LOW_STOCK ? "Sắp hết hàng" : null;
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/5">
      <Link href={href} className="product-stage relative block aspect-square overflow-hidden" tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.image}
          alt=""
          className="size-full p-5 transition duration-500 group-hover:scale-105"
        />
        {badge && (
          <span className="absolute top-3 left-3 rounded-full bg-fg px-2.5 py-1 text-xs font-medium text-bg">{badge}</span>
        )}
        <span className="absolute bottom-3 left-3 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold">3D</span>
      </Link>
      <WishlistButton productId={product.id} name={product.name} className="absolute top-3 right-3" />
      <div className="flex flex-1 flex-col gap-1 px-4 pt-4 pb-4">
        <p className="text-[11px] font-bold tracking-wider text-brand-strong uppercase">
          {getCategory(product.category)?.name ?? "Mô hình"}
        </p>
        <h3 className="text-base leading-snug font-semibold">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <p className="line-clamp-1 text-sm text-muted">{product.tagline}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <div className="flex flex-col">
            {onSale && <span className="text-xs text-muted line-through tabular-nums">{formatVnd(product.compareAtPrice!)}</span>}
            <span className={`text-[17px] font-bold tabular-nums ${onSale ? "text-sale" : ""}`}>{formatVnd(product.price)}</span>
          </div>
          <AddToCartButton id={product.variantId} name={product.name} stock={product.stock} compact />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }: { products: ProductSummary[]; columns?: 3 | 4 }) {
  return (
    <ul className={`grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : "lg:grid-cols-4"}`}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
