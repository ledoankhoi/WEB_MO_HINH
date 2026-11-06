"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Truck, X } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { showToast } from "@/components/ui/Toaster";
import { site } from "@/config/site";
import { cart, useCart, useCartCount } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import type { ProductSummary } from "@/lib/types";
import { OnNavigate } from "./OnNavigate";

const ISSUE_TEXT = { unavailable: "Không còn bán", out_of_stock: "Đã hết hàng", over_stock: "Vượt số còn lại" } as const;

const badge = (count: number) => (count > 99 ? "99+" : String(count));

// Nút giỏ hàng ở đầu trang. Màn hình rộng: bấm mở giỏ xem nhanh (tiến độ miễn phí giao hàng, sửa số lượng, gợi ý mua
// kèm). Điện thoại: mở thẳng trang giỏ hàng. `addOns`: phụ kiện còn hàng, rẻ trước (getAddOnProducts).
export function CartButton({ addOns }: { addOns: ProductSummary[] }) {
  const count = useCartCount();
  const { rows, totals, loading, canCheckout } = useCart();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);

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

  const freeFrom = site.shipping.freeFrom;
  const remaining = Math.max(0, freeFrom - totals.subtotal);
  const progress = Math.min(100, Math.round((totals.subtotal / freeFrom) * 100));
  const inCart = new Set(rows.map((row) => row.id));
  const candidates = addOns.filter((item) => item.stock > 0 && !inCart.has(item.variantId));
  // Còn thiếu cho mức miễn phí giao hàng: chọn món rẻ nhất đủ bù; không có thì món đắt nhất. Đã đủ: món rẻ nhất.
  const addOn = remaining > 0 ? (candidates.find((item) => item.price >= remaining) ?? candidates.at(-1)) : candidates[0];
  const label = count > 0 ? `Giỏ hàng, ${count} sản phẩm${loading ? "" : `, ${formatVnd(totals.subtotal)}`}` : "Giỏ hàng";

  return (
    <div ref={root} className="relative">
      {/* Sang trang khác thì đóng. */}
      <OnNavigate onChange={() => setOpen(false)} />
      <Link
        href="/gio-hang"
        aria-label={label}
        className="relative grid size-11 place-items-center border-3 border-ink bg-brand text-white shadow-[3px_3px_0_var(--color-ink)] lg:hidden"
      >
        <ShoppingBag className="size-5" strokeWidth={2.4} aria-hidden />
        {count > 0 && <CountBadge>{badge(count)}</CountBadge>}
      </Link>

      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="relative hidden h-[52px] items-center gap-2.5 border-3 border-ink bg-brand px-4 text-white shadow-[4px_4px_0_var(--color-ink)] transition hover:brightness-110 lg:flex"
      >
        <ShoppingBag className="size-[22px]" strokeWidth={2.4} aria-hidden />
        <span className="font-condensed text-xl font-extrabold whitespace-nowrap uppercase tabular-nums">
          {count > 0 && !loading ? formatVnd(totals.subtotal) : "Giỏ hàng"}
        </span>
        {count > 0 && <CountBadge>{badge(count)}</CountBadge>}
      </button>

      {open && (
        <section
          id={panelId}
          aria-label="Giỏ hàng xem nhanh"
          className="absolute top-full right-0 z-50 mt-4 hidden w-[26rem] flex-col gap-4 border-3 border-ink bg-surface p-5 text-fg shadow-[8px_8px_0_var(--color-ink)] lg:flex"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-condensed text-2xl font-black uppercase italic">Giỏ hàng ({count})</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng giỏ hàng" className="-m-2 grid size-11 place-items-center hover:bg-raised">
              <X className="size-5" aria-hidden />
            </button>
          </div>

          {count === 0 ? (
            <div className="space-y-4 py-2">
              <p className="text-muted">Giỏ hàng đang trống.</p>
              <Link href="/san-pham" className="btn btn-primary btn-md inline-flex items-center justify-center bg-brand px-5 text-brand-ink">
                Xem sản phẩm
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-2 border-3 border-ink bg-raised p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Truck className="size-5 shrink-0" aria-hidden />
                  {loading ? (
                    "Đang cập nhật giá…"
                  ) : remaining > 0 ? (
                    <span>
                      Mua thêm <strong>{formatVnd(remaining)}</strong> để được miễn phí giao hàng
                    </span>
                  ) : (
                    <span className="font-semibold text-success">Đơn của bạn được miễn phí giao hàng</span>
                  )}
                </p>
                <div
                  role="progressbar"
                  aria-label="Tiến độ miễn phí giao hàng"
                  aria-valuemin={0}
                  aria-valuemax={freeFrom}
                  aria-valuenow={Math.min(totals.subtotal, freeFrom)}
                  className="h-2.5 border-2 border-ink bg-surface"
                >
                  <div className="h-full bg-cobalt" style={{ width: `${loading ? 0 : progress}%` }} />
                </div>
              </div>

              <ul className="max-h-72 space-y-3 overflow-y-auto">
                {rows.map((row) => (
                  <li key={row.id} className="flex gap-3">
                    <span className="halftone size-16 shrink-0 border-2 border-ink">
                      <ProductImage src={row.product?.image ?? null} alt="" className="size-full p-1" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex justify-between gap-2">
                        {row.product ? (
                          <Link href={`/san-pham/${row.product.slug}`} className="font-condensed text-[17px] leading-tight font-bold uppercase hover:text-brand">
                            {row.product.name}
                          </Link>
                        ) : (
                          <span className="text-sm text-muted">Đang tải…</span>
                        )}
                        <span className="font-condensed text-lg font-black whitespace-nowrap italic tabular-nums">{formatVnd(row.lineTotal)}</span>
                      </div>
                      {row.issue && <p className="text-xs font-semibold text-brand-strong">{ISSUE_TEXT[row.issue]}</p>}
                      <div className="flex items-center justify-between gap-2">
                        <div role="group" aria-label="Số lượng" className="flex items-center border-2 border-ink">
                          <button
                            type="button"
                            aria-label="Giảm số lượng"
                            onClick={() => cart.setQuantity(row.id, row.qty - 1)}
                            className="grid size-9 place-items-center hover:bg-raised"
                          >
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <span className="min-w-7 text-center font-semibold tabular-nums">{row.qty}</span>
                          <button
                            type="button"
                            aria-label="Tăng số lượng"
                            disabled={row.qty >= row.maxQty}
                            onClick={() => cart.setQuantity(row.id, row.qty + 1)}
                            className="grid size-9 place-items-center hover:bg-raised disabled:opacity-40"
                          >
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                        <button type="button" onClick={() => cart.remove(row.id)} className="px-2 py-2 text-sm font-semibold text-muted underline hover:text-fg">
                          Xoá
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {addOn && !loading && (
                <div className="space-y-2 border-t-3 border-ink pt-3">
                  <p className="font-condensed text-sm font-bold tracking-[0.08em] text-muted uppercase">Thường mua kèm</p>
                  <div className="flex items-center gap-3 border-2 border-ink p-2">
                    <span className="halftone size-12 shrink-0 border-2 border-ink">
                      <ProductImage src={addOn.image} alt="" className="size-full p-0.5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <Link href={`/san-pham/${addOn.slug}`} className="truncate text-sm font-semibold hover:text-brand">
                        {addOn.name}
                      </Link>
                      <span className="font-condensed text-base font-black italic tabular-nums">{formatVnd(addOn.price)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Thêm ${addOn.name} vào giỏ`}
                      onClick={() => {
                        if (cart.add(addOn.variantId, 1, addOn.stock) > 0) showToast(`Đã thêm ${addOn.name} vào giỏ hàng.`);
                      }}
                      className="flex h-11 shrink-0 items-center gap-1 bg-ink px-3 font-condensed text-base font-extrabold text-white uppercase hover:bg-brand"
                    >
                      <Plus className="size-4" aria-hidden />
                      Thêm
                    </button>
                  </div>
                  {remaining > 0 && addOn.price >= remaining && <p className="text-sm font-semibold text-success">Thêm món này là đơn được miễn phí giao hàng.</p>}
                </div>
              )}

              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t-3 border-ink pt-3 text-sm">
                <dt className="text-muted">Tạm tính</dt>
                <dd className="text-right font-bold tabular-nums">{loading ? "…" : formatVnd(totals.subtotal)}</dd>
                <dt className="text-muted">Phí giao hàng</dt>
                <dd className="text-right font-bold tabular-nums">{loading ? "…" : totals.shipping === 0 ? "Miễn phí" : formatVnd(totals.shipping)}</dd>
              </dl>

              <div className="grid grid-cols-2 gap-3">
                <Link href="/gio-hang" className="btn btn-secondary btn-md inline-flex items-center justify-center px-3">
                  Xem giỏ hàng
                </Link>
                <Link
                  href={canCheckout ? "/thanh-toan" : "/gio-hang"}
                  className="btn btn-primary btn-md inline-flex items-center justify-center bg-brand px-3 text-brand-ink"
                >
                  Thanh toán
                </Link>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CountBadge({ children }: { children: string }) {
  return (
    <span
      aria-hidden
      className="absolute -top-3 -right-3 grid h-6 min-w-6 place-items-center rounded-full border-2 border-ink bg-surface px-1.5 text-xs font-bold text-ink tabular-nums"
    >
      {children}
    </span>
  );
}
