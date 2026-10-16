"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { ProductImage } from "@/components/product/ProductCard";
import { QuantityStepper } from "@/components/product/PurchasePanel";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { site } from "@/config/site";
import { cart, useCart, type CartRow } from "@/lib/cart";
import { formatVnd } from "@/lib/format";

const ISSUE_TEXT: Record<NonNullable<CartRow["issue"]>, string> = {
  unavailable: "Sản phẩm này hiện không còn bán. Vui lòng xoá khỏi giỏ.",
  out_of_stock: "Sản phẩm đã hết hàng. Vui lòng xoá khỏi giỏ.",
  over_stock: "Số lượng trong giỏ vượt quá số hàng còn lại.",
};

export function OrderSummary({ totals, couponCode }: { totals: { subtotal: number; discount?: number; shipping: number; total: number }; couponCode?: string | null }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted">Tạm tính</dt>
        <dd className="tabular-nums">{formatVnd(totals.subtotal)}</dd>
      </div>
      {!!totals.discount && (
        <div className="flex justify-between">
          <dt className="text-muted">Giảm giá{couponCode && ` (${couponCode})`}</dt>
          <dd className="tabular-nums">−{formatVnd(totals.discount)}</dd>
        </div>
      )}
      <div className="flex justify-between">
        <dt className="text-muted">Phí vận chuyển</dt>
        <dd className="tabular-nums">{totals.shipping === 0 ? "Miễn phí" : formatVnd(totals.shipping)}</dd>
      </div>
      <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
        <dt>Tổng cộng</dt>
        <dd className="tabular-nums">{formatVnd(totals.total)}</dd>
      </div>
    </dl>
  );
}

export function CartView() {
  const { rows, loading, failed, totals, canCheckout, reload } = useCart();

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
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((row) => (
          <li key={row.id} className="flex gap-4 p-4">
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
                <button
                  type="button"
                  onClick={() => cart.remove(row.id)}
                  className="shrink-0 text-muted transition hover:text-danger"
                  aria-label={`Xoá ${row.product?.name ?? "sản phẩm"} khỏi giỏ`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              {row.product && <p className="text-sm text-muted tabular-nums">{formatVnd(row.product.price)}</p>}
              {row.issue && <p className="text-sm text-danger">{ISSUE_TEXT[row.issue]}</p>}
              {row.product && row.maxQty > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {row.issue === "over_stock" ? (
                    <Button size="sm" variant="secondary" onClick={() => cart.setQuantity(row.id, row.maxQty)}>
                      Giảm còn {row.maxQty}
                    </Button>
                  ) : (
                    <QuantityStepper
                      value={row.qty}
                      max={row.maxQty}
                      onChange={(value) => cart.setQuantity(row.id, value)}
                      label={`Số lượng ${row.product.name}`}
                    />
                  )}
                  <p className="font-semibold tabular-nums">{formatVnd(row.lineTotal)}</p>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Tóm tắt đơn hàng</h2>
        <OrderSummary totals={totals} />
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
