"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedVnd } from "@/components/animate/AnimatedNumber";
import { AnimateIcon, Trash2 } from "@/components/animate/icons";
import { ProductImage } from "@/components/product/ProductCard";
import { QuantityStepper } from "@/components/product/PurchasePanel";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { site } from "@/config/site";
import { cart, useCart, type CartRow } from "@/lib/cart";
import { flashLimit } from "@/lib/flash-sale";
import { formatDate, formatVnd } from "@/lib/format";
import { WorkshopLines } from "./WorkshopLines";

const ISSUE_TEXT: Record<NonNullable<CartRow["issue"]>, string> = {
  unavailable: "Sản phẩm này hiện không còn bán. Vui lòng xoá khỏi giỏ.",
  out_of_stock: "Sản phẩm đã hết hàng. Vui lòng xoá khỏi giỏ.",
  over_stock: "Số lượng trong giỏ vượt quá số còn đặt được.",
  preorder_closed: "Đợt đặt trước đã ngừng nhận hoặc hết suất. Vui lòng xoá khỏi giỏ.",
};

// Nhãn "Đặt trước" của một dòng giỏ: ngày dự kiến về và phần trăm cọc.
export function PreorderTag({ expectedAt, depositPercent }: { expectedAt: number; depositPercent: number }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 text-xs font-semibold text-cobalt">
      <span className="border-2 border-ink bg-cobalt px-1.5 py-px font-condensed text-sm font-extrabold text-white uppercase">Đặt trước</span>
      <span>Dự kiến về {formatDate(expectedAt)}</span>
      {depositPercent > 0 && <span className="text-muted">· cọc {depositPercent}%</span>}
    </p>
  );
}

// Gợi ý món còn thiếu để đủ bộ combo (nghiep-vu-ban-hang mục 12), mỗi món một nút thêm vào giỏ.
function ComboSuggestions({ missing, members }: { missing: ReturnType<typeof useCart>["bundle"]["missing"]; members: ReturnType<typeof useCart>["bundle"]["members"] }) {
  if (missing.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-brand/50 bg-brand/5 p-3 text-sm">
      {missing.map((deal) => (
        <div key={deal.dealId} className="space-y-2">
          <p className="font-semibold">
            Thêm {deal.missing.length} món để đủ bộ “{deal.name}”, giảm {deal.percent}%:
          </p>
          <ul className="space-y-1.5">
            {deal.missing.map((id) => {
              const product = members.get(id);
              if (!product) return null;
              return (
                <li key={id} className="flex items-center gap-2">
                  <Link href={`/san-pham/${product.slug}`} className="min-w-0 flex-1 truncate hover:underline">
                    {product.name}
                  </Link>
                  <span className="shrink-0 tabular-nums">{formatVnd(product.price)}</span>
                  <Button size="sm" variant="secondary" disabled={product.stock <= 0 && !product.preorder} onClick={() => cart.add(product.variantId, 1)}>
                    Thêm
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Lời dặn khi giỏ có hàng đặt trước: giao một lần khi đủ hàng, tiền cọc.
export function PreorderNotice({ deposit }: { deposit: number }) {
  return (
    <Notice tone="info">
      Đơn có hàng đặt trước sẽ được giao một lần khi hàng về đủ; muốn nhận hàng có sẵn trước, hãy đặt hai đơn riêng.
      {deposit > 0 && <> Tiền cọc trả trước: <strong>{formatVnd(deposit)}</strong>, phần còn lại trả khi nhận hàng.</>}
    </Notice>
  );
}

// `bundleDiscount`: phần giảm combo nằm trong `discount` (hiện tách dòng); phần còn lại là mã giảm giá.
export function OrderSummary({
  totals,
  couponCode,
  bundleDiscount = 0,
}: {
  totals: { subtotal: number; discount?: number; shipping: number; total: number };
  couponCode?: string | null;
  bundleDiscount?: number;
}) {
  const couponPart = (totals.discount ?? 0) - bundleDiscount;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted">Tạm tính</dt>
        <dd><AnimatedVnd amount={totals.subtotal} /></dd>
      </div>
      {bundleDiscount > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted">Giảm combo</dt>
          <dd><AnimatedVnd amount={-bundleDiscount} /></dd>
        </div>
      )}
      {couponPart > 0 && (
        <div className="flex justify-between">
          <dt className="text-muted">Giảm giá{couponCode && ` (${couponCode})`}</dt>
          <dd><AnimatedVnd amount={-couponPart} /></dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">Phí vận chuyển</dt>
        <dd>{totals.shipping === 0 ? "Miễn phí" : <AnimatedVnd amount={totals.shipping} />}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
        <dt>Tổng cộng</dt>
        <dd><AnimatedVnd amount={totals.total} /></dd>
      </div>
    </dl>
  );
}

export function CartView() {
  const { rows, loading, failed, totals, deposit, hasPreorder, bundle, canCheckout, reload } = useCart();

  if (loading) return <p className="py-20 text-center text-sm text-muted">Đang tải giỏ hàng...</p>;

  if (failed) {
    return (
      <Notice tone="error">
        Không tải được thông tin sản phẩm.{" "}
        <button type="button" onClick={reload} className="font-semibold underline">
          Thử lại
        </button>
      </Notice>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-16 text-center">
        <p className="font-semibold">Giỏ hàng của bạn đang trống</p>
        <p className="mt-1 text-sm text-muted">Hãy chọn vài mô hình ưng ý rồi quay lại đây.</p>
        <ButtonLink href="/san-pham" className="mt-5">
          Tiếp tục mua sắm
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            <motion.li
              key={row.key}
              layout
              exit={{ opacity: 0, height: 0, transition: { duration: 0.25 } }}
              className="flex gap-4 p-4"
            >
              <div className="product-stage size-24 shrink-0 overflow-hidden rounded-lg">
                <ProductImage src={row.product?.image ?? null} alt="" className="size-full p-1" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  {row.product ? (
                    <Link href={`/san-pham/${row.product.slug}`} className="font-semibold hover:underline">
                      {row.product.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">Sản phẩm không còn tồn tại</span>
                  )}
                  <AnimateIcon animateOnHover asChild>
                    <button
                      type="button"
                      onClick={() => cart.remove(row.key)}
                      className="shrink-0 text-muted transition hover:text-danger"
                      aria-label={`Xoá ${row.product?.name ?? "sản phẩm"} khỏi giỏ`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </AnimateIcon>
                </div>
                {row.product && (
                  <p className="text-sm text-muted tabular-nums">
                    {formatVnd(row.unitPrice)}
                    {row.product.flash && (
                      <>
                        {" "}
                        <span className="line-through">{formatVnd(row.product.basePrice + (row.config?.price ?? 0))}</span>{" "}
                        <span className="font-semibold text-brand">Flash sale · tối đa {flashLimit(row.product.flash)}</span>
                      </>
                    )}
                  </p>
                )}
                {row.product?.preorder && <PreorderTag expectedAt={row.product.preorder.expectedAt} depositPercent={row.product.preorder.depositPercent} />}
                {row.config && row.config.lines.length > 0 && <WorkshopLines config={row.config} />}
                {row.issue && <p className="text-sm text-danger">{ISSUE_TEXT[row.issue]}</p>}
                {row.product && row.maxQty > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {row.issue === "over_stock" ? (
                      <Button size="sm" variant="secondary" onClick={() => cart.setQuantity(row.key, row.maxQty)}>
                        Giảm còn {row.maxQty}
                      </Button>
                    ) : (
                      <QuantityStepper
                        value={row.qty}
                        max={row.maxQty}
                        onChange={(value) => cart.setQuantity(row.key, value)}
                        label={`Số lượng ${row.product.name}`}
                      />
                    )}
                    <AnimatedVnd amount={row.lineTotal} className="font-semibold" />
                  </div>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Tóm tắt đơn hàng</h2>
        <OrderSummary totals={totals} bundleDiscount={totals.discount} />
        {bundle.applied.map((item) => (
          <p key={item.dealId} className="text-xs font-semibold text-success">
            Đã đủ bộ “{item.name}”{item.sets > 1 ? ` × ${item.sets}` : ""}: giảm {item.percent}%.
          </p>
        ))}
        <ComboSuggestions missing={bundle.missing} members={bundle.members} />
        {hasPreorder && <PreorderNotice deposit={deposit} />}
        {totals.shipping > 0 && (
          <p className="text-xs text-muted">Miễn phí vận chuyển cho đơn từ {formatVnd(site.shipping.freeFrom)}.</p>
        )}
        <ButtonLink href="/thanh-toan" size="lg" full aria-disabled={!canCheckout} tabIndex={canCheckout ? undefined : -1}>
          Tiến hành đặt hàng
        </ButtonLink>
        <Link href="/san-pham" className="block text-center text-sm text-muted hover:text-fg">
          Tiếp tục mua sắm
        </Link>
      </aside>
    </div>
  );
}
