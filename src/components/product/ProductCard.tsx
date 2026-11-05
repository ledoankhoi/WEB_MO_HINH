import Image from "next/image";
import Link from "next/link";
import { getCategory } from "@/lib/catalog";
import { discountPercent, formatVnd } from "@/lib/format";
import { transformLabel } from "@/lib/model-features";
import type { ProductSummary } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";
import { StockAlertButton } from "./StockAlertButton";
import { WishlistButton } from "./WishlistButton";

// Ngưỡng tồn kho để báo "Chỉ còn ...".
const LOW_STOCK = 3;

export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  if (!src) {
    return <div className={`grid place-items-center text-sm text-muted ${className}`}>Chưa có ảnh</div>;
  }
  // Ảnh đã là WebP kích thước nhỏ nên không cần qua bộ tối ưu ảnh.
  return <Image src={src} alt={alt} width={640} height={640} unoptimized className={`object-contain ${className}`} />;
}

// Thẻ sản phẩm kiểu "hộp mô hình": viền đen dày, bóng lệch, nền chấm in, nhãn dán nghiêng cho mô hình biến hình hoặc
// hợp thể được trong khung 3D và cho hàng giảm giá.
export function ProductCard({ product }: { product: ProductSummary }) {
  const href = `/san-pham/${product.slug}`;
  const sticker = transformLabel(product.modelUrl);
  const discount = discountPercent(product.price, product.compareAtPrice);
  const soldOut = product.stock <= 0;

  return (
    <article className="relative flex h-full flex-col border-3 border-ink bg-surface shadow-[6px_6px_0_var(--color-ink)] transition hover:-translate-y-0.5 hover:shadow-[8px_8px_0_var(--color-ink)]">
      <div className="relative border-b-3 border-ink">
        <Link href={href} className="halftone block aspect-square overflow-hidden" tabIndex={-1} aria-hidden>
          <ProductImage src={product.image} alt="" className={`size-full p-4 ${soldOut ? "opacity-60 grayscale" : ""}`} />
        </Link>
        <div className="pointer-events-none absolute top-3 left-2.5 flex flex-col items-start gap-2">
          {sticker && (
            <span className="-rotate-4 border-2 border-ink bg-brand px-2.5 py-0.5 font-condensed text-base font-extrabold text-white uppercase">
              {sticker}
            </span>
          )}
          {discount !== null && (
            <span className="rotate-3 border-2 border-ink bg-cobalt px-2.5 py-0.5 font-condensed text-base font-extrabold text-white uppercase">
              Giảm {discount}%
            </span>
          )}
        </div>
        <WishlistButton productId={product.id} name={product.name} className="absolute top-2 right-2" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="font-condensed text-[15px] font-bold tracking-[0.08em] text-cobalt uppercase">
          {getCategory(product.category)?.name ?? "Mô hình"}
        </p>
        <h3 className="min-h-[2.1em] font-condensed text-[22px] leading-[1.05] font-extrabold uppercase">
          <Link href={href} className="hover:text-brand">
            {product.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <p className={`font-condensed text-[30px] leading-tight font-black italic tabular-nums ${discount !== null ? "text-brand" : ""}`}>
            {formatVnd(product.price)}
          </p>
          {discount !== null && <p className="text-sm text-muted line-through tabular-nums">{formatVnd(product.compareAtPrice!)}</p>}
        </div>
        {!soldOut && product.stock <= LOW_STOCK && (
          <p className="font-condensed text-base font-bold text-brand-strong uppercase">Chỉ còn {product.stock}</p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2.5">
          {soldOut ? (
            <>
              <p className="font-condensed text-base font-extrabold text-brand-strong uppercase">Hết hàng</p>
              <StockAlertButton variantId={product.variantId} name={product.name} />
            </>
          ) : (
            <AddToCartButton id={product.variantId} name={product.name} stock={product.stock} bar label="Thêm vào giỏ" />
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, columns = 4 }: { products: ProductSummary[]; columns?: 3 | 4 }) {
  return (
    <ul className={`grid grid-cols-1 gap-7 min-[480px]:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : "lg:grid-cols-4"}`}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}
