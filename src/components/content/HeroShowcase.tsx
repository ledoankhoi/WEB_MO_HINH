"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductImage } from "@/components/product/ProductCard";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import type { RobotViewerProps } from "@/components/three/RobotViewer";
import { buttonClass } from "@/components/ui/Button";
import { formatVnd } from "@/lib/format";

export type HeroItem = {
  slug: string;
  name: string;
  tagline: string;
  categoryName: string;
  price: number;
  stock: number;
  variantId: string;
  image: string | null;
  viewer: RobotViewerProps;
};

// Đầu trang chủ: một sản phẩm nổi bật (thông tin + nút mua bên trái, mô hình 3D bên phải) và dải ô nhỏ
// để đổi sang sản phẩm nổi bật khác mà không rời trang.
export function HeroShowcase({ items }: { items: HeroItem[] }) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  if (!item) return null;
  const status = item.stock <= 0 ? "Hết hàng" : item.stock <= 3 ? `Sắp hết hàng (còn ${item.stock})` : "Còn hàng";

  return (
    <div className="grid overflow-hidden rounded-[1.75rem] border border-line bg-surface lg:grid-cols-[5fr_7fr]">
      <div className="flex flex-col justify-center gap-5 p-7 sm:p-10 lg:p-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.slug}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="space-y-5"
          >
            <p className="text-xs font-bold tracking-[0.2em] text-brand-strong uppercase">{item.categoryName} · Nổi bật</p>
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">{item.name}</h1>
            <p className="max-w-md text-base leading-relaxed text-muted sm:text-lg">{item.tagline}</p>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-3xl font-extrabold tabular-nums">{formatVnd(item.price)}</span>
              <span className={`text-sm font-semibold ${item.stock > 0 ? "text-success" : "text-danger"}`}>{status}</span>
            </div>
          </motion.div>
        </AnimatePresence>
        <div className="flex flex-wrap gap-3">
          <AddToCartButton id={item.variantId} name={item.name} stock={item.stock} size="lg" />
          <Link href={`/san-pham/${item.slug}`} className={buttonClass({ variant: "secondary", size: "lg" })}>
            Xem chi tiết
          </Link>
        </div>
      </div>

      <div className="product-stage relative h-[380px] border-t border-line sm:h-[520px] lg:border-t-0 lg:border-l">
        <RobotViewerLoader key={item.slug} {...item.viewer} />
        {items.length > 1 && (
          <div className="absolute top-4 right-4 flex items-center gap-2 sm:top-5 sm:right-5" role="group" aria-label="Đổi mô hình nổi bật">
            {items.map((other, i) => (
              <button
                key={other.slug}
                type="button"
                onClick={() => setIndex(i)}
                aria-pressed={i === index}
                aria-label={`Xem ${other.name}`}
                className={`size-14 overflow-hidden rounded-2xl border-2 bg-surface p-1 transition ${
                  i === index ? "border-brand" : "border-line hover:border-fg/30"
                }`}
              >
                <ProductImage src={other.image} alt="" className="product-stage size-full rounded-xl" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
