import { ProductImage } from "@/components/product/ProductCard";
import type { ComicPanel as Panel } from "@/data/comics";
import type { ProductSummary } from "@/lib/types";

const SIZE = { wide: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2" } as const;
const BACKGROUND = { burst: "comic-burst", dots: "comic-dots", ink: "bg-ink text-white" } as const;

// Một khung truyện: hình mô hình (ảnh dựng 3D của sản phẩm) trên nền tia tốc độ hoặc chấm in, lời dẫn ở góc trên, bong
// bóng thoại ở dưới, chữ tượng thanh nghiêng lớn.
export function ComicPanel({ panel, product }: { panel: Panel; product: ProductSummary | null }) {
  const textOnly = !panel.product;
  return (
    <figure
      className={`relative col-span-6 flex min-h-56 flex-col overflow-hidden border-4 border-ink ${SIZE[panel.size]} ${BACKGROUND[panel.background ?? "dots"]} ${
        textOnly ? "justify-center p-6" : ""
      }`}
    >
      {panel.narration && (
        <figcaption
          className={`${textOnly ? "font-condensed text-3xl leading-tight font-black uppercase italic sm:text-4xl" : "absolute top-3 left-3 z-10 max-w-[80%] border-2 border-ink bg-[#fff3a8] px-3 py-1.5 text-sm font-semibold text-ink"}`}
        >
          {panel.narration}
        </figcaption>
      )}
      {product && (
        <ProductImage
          src={product.image}
          alt={product.name}
          className={`mx-auto w-full p-3 ${panel.flip ? "-scale-x-100" : ""} ${panel.size === "wide" ? "h-80" : panel.size === "half" ? "h-64" : "h-52"}`}
        />
      )}
      {panel.sfx && (
        <span
          aria-hidden
          className="comic-sfx absolute top-4 right-4 -rotate-12 font-condensed text-5xl font-black text-brand uppercase italic sm:text-6xl"
        >
          {panel.sfx}
        </span>
      )}
      {panel.bubbles?.map((bubble, index) => (
        <blockquote
          key={index}
          className={`relative z-10 mx-3 mb-3 max-w-[92%] rounded-[1.4rem] border-3 border-ink bg-surface px-4 py-2.5 text-[15px] leading-snug font-semibold text-ink ${
            bubble.side === "right" ? "self-end" : "self-start"
          }`}
        >
          {bubble.speaker && <span className="block font-condensed text-sm font-extrabold tracking-wide text-brand uppercase">{bubble.speaker}</span>}
          {bubble.text}
          {/* Đuôi bong bóng thoại. */}
          <span
            aria-hidden
            className={`absolute -top-3 size-5 rotate-45 border-t-3 border-l-3 border-ink bg-surface ${bubble.side === "right" ? "right-8" : "left-8"}`}
          />
        </blockquote>
      ))}
    </figure>
  );
}
