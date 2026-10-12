import Image from "next/image";
import Link from "next/link";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";

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

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition hover:shadow-lg hover:shadow-black/5">
      <Link href={href} className="product-stage relative block aspect-square overflow-hidden" tabIndex={-1} aria-hidden>
        <ProductImage
          src={product.image}
          alt=""
          className="size-full p-4 transition duration-500 group-hover:scale-105"
        />
        {badge && (
          <span className="absolute top-3 left-3 rounded-full bg-fg px-2.5 py-1 text-xs font-medium text-bg">{badge}</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-xs font-medium tracking-wide text-brand-strong uppercase">
          {getCategory(product.category)?.name ?? "Mô hình"}
        </p>
        <h3 className="text-base font-semibold">
          <Link href={href} className="hover:underline">
            {product.name}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-muted">{product.tagline}</p>
        <p className="mt-auto pt-3 text-base font-semibold tabular-nums">{formatVnd(product.price)}</p>
        <div className="pt-2">
          <AddToCartButton id={product.id} name={product.name} stock={product.stock} full />
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className="grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
