"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronRight, LayoutGrid, X } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { formatVnd } from "@/lib/format";
import { transformLabel } from "@/lib/model-features";
import type { MegaMenuCategory } from "@/server/catalog";

const PRICE_RANGES = [
  { label: "Dưới 1 triệu ₫", query: "gia-den=999999" },
  { label: "1 – 2 triệu ₫", query: "gia-tu=1000000&gia-den=2000000" },
  { label: "2 – 3 triệu ₫", query: "gia-tu=2000000&gia-den=3000000" },
  { label: "Trên 3 triệu ₫", query: "gia-tu=3000000" },
];

const GROUP_TITLE = "mb-2 font-condensed text-sm font-bold tracking-[0.08em] text-muted uppercase";
const GROUP_LINK = "block py-1.5 text-[15px] font-medium hover:text-brand hover:underline";

// Nút "Tất cả danh mục" ở thanh danh mục và bảng menu mở rộng ngay dưới thanh. Rê chuột hoặc chuyển tiêu điểm tới một
// danh mục ở cột trái để xem nhóm lọc của danh mục đó. Esc, bấm ra ngoài hoặc chọn một mục thì đóng.
export function MegaMenu({ categories }: { categories: MegaMenuCategory[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState(categories[0]?.slug ?? "");
  const [shownPath, setShownPath] = useState(pathname);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

  if (pathname !== shownPath) {
    setShownPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (categories.length === 0) return null;
  const active = categories.find((category) => category.slug === activeSlug) ?? categories[0];
  const base = `/san-pham?loai=${active.slug}`;
  const close = () => setOpen(false);
  const sticker = active.featured ? transformLabel(active.featured.modelUrl) : null;

  return (
    <div ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="-ml-4 flex h-14 shrink-0 items-center gap-2 bg-brand px-4 font-condensed text-lg font-extrabold tracking-[0.04em] text-white uppercase transition hover:brightness-110 sm:-ml-6 sm:px-6"
      >
        {open ? <X className="size-[18px]" strokeWidth={2.6} aria-hidden /> : <LayoutGrid className="size-[18px]" strokeWidth={2.6} aria-hidden />}
        Tất cả danh mục
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} strokeWidth={2.6} aria-hidden />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute inset-x-4 top-full z-50 mt-0 flex border-3 border-t-0 border-ink bg-surface text-fg normal-case shadow-[10px_10px_0_var(--color-ink)] sm:inset-x-6"
        >
          <ul className="w-72 shrink-0 border-r-3 border-ink py-2">
            {categories.map((category) => {
              const current = category.slug === active.slug;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/san-pham?loai=${category.slug}`}
                    onMouseEnter={() => setActiveSlug(category.slug)}
                    onFocus={() => setActiveSlug(category.slug)}
                    onClick={close}
                    className={`flex items-center gap-3 px-3 py-2 ${current ? "bg-ink text-white" : "hover:bg-raised"}`}
                  >
                    <span className="halftone size-10 shrink-0 border-2 border-ink">
                      <ProductImage src={category.featured?.image ?? null} alt="" className="size-full p-0.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-condensed text-lg leading-tight font-extrabold uppercase">{category.name}</span>
                      <span className={`text-xs ${current ? "text-white/80" : "text-muted"}`}>{category.count} sản phẩm</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0" strokeWidth={2.6} aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0 flex-1 space-y-5 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <p className="font-condensed text-3xl leading-none font-black uppercase italic">{active.name}</p>
              <Link href={base} onClick={close} className="inline-flex items-center gap-1.5 font-condensed text-base font-extrabold text-cobalt uppercase hover:underline">
                Xem tất cả {active.count} sản phẩm
                <ArrowRight className="size-4" strokeWidth={2.6} aria-hidden />
              </Link>
            </div>
            <p className="text-sm text-muted">{active.description}</p>

            <div className="grid grid-cols-3 gap-6">
              {active.series.length > 0 && (
                <div>
                  <p className={GROUP_TITLE}>Theo dòng phim</p>
                  {active.series.map((item) => (
                    <Link key={item.slug} href={`${base}&series=${item.slug}`} onClick={close} className={GROUP_LINK}>
                      {item.name} <span className="text-muted">({item.count})</span>
                    </Link>
                  ))}
                </div>
              )}
              {active.brands.length > 0 && (
                <div>
                  <p className={GROUP_TITLE}>Theo hãng</p>
                  {active.brands.map((item) => (
                    <Link key={item.slug} href={`${base}&thuong-hieu=${item.slug}`} onClick={close} className={GROUP_LINK}>
                      {item.name} <span className="text-muted">({item.count})</span>
                    </Link>
                  ))}
                </div>
              )}
              <div>
                <p className={GROUP_TITLE}>Theo giá</p>
                {PRICE_RANGES.map((range) => (
                  <Link key={range.query} href={`${base}&${range.query}`} onClick={close} className={GROUP_LINK}>
                    {range.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {active.transformable > 0 && (
                <Link
                  href={`${base}&bien-hinh=1`}
                  onClick={close}
                  className="border-2 border-ink bg-brand px-3 py-2 font-condensed text-base font-extrabold text-white uppercase hover:brightness-110"
                >
                  Có biến hình 3D ({active.transformable})
                </Link>
              )}
              <Link href={`${base}&con-hang=1`} onClick={close} className="border-2 border-ink bg-surface px-3 py-2 font-condensed text-base font-extrabold uppercase hover:bg-raised">
                Còn hàng
              </Link>
            </div>
          </div>

          {active.featured && (
            <div className="w-72 shrink-0 border-l-3 border-ink p-5">
              <p className={GROUP_TITLE}>Nổi bật</p>
              <Link href={`/san-pham/${active.featured.slug}`} onClick={close} className="group block space-y-2">
                <span className="halftone relative block aspect-square border-3 border-ink">
                  <ProductImage src={active.featured.image} alt="" className="size-full p-3" />
                  {sticker && (
                    <span className="absolute top-2 left-2 -rotate-4 border-2 border-ink bg-brand px-2 py-0.5 font-condensed text-sm font-extrabold text-white uppercase">
                      {sticker}
                    </span>
                  )}
                </span>
                <span className="block font-condensed text-lg leading-tight font-extrabold uppercase group-hover:text-brand">{active.featured.name}</span>
                <span className="block font-condensed text-2xl font-black italic tabular-nums">{formatVnd(active.featured.price)}</span>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
