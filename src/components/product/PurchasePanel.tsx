"use client";

import { useState } from "react";
import { AnimatedNumber, AnimatedVnd } from "@/components/animate/AnimatedNumber";
import { AnimateIcon, Minus, Plus } from "@/components/animate/icons";
import { RadioGroup, RadioGroupItem, radioCardClass } from "@/components/animate/RadioGroup";
import { site } from "@/config/site";
import { formatDate, formatVnd } from "@/lib/format";
import { canPreorder, lineDeposit, orderableQty, type PreorderOffer } from "@/lib/preorder";
import type { ProductVariant } from "@/lib/types";
import { AddToCartButton, BuyNowButton } from "./AddToCartButton";
import { StockAlertButton } from "./StockAlertButton";
import { useNow } from "./FlashPrice";
import { flashLimit, flashState } from "@/lib/flash-sale";

// Hộp thông tin hàng đặt trước trong khung mua: ngày dự kiến về, tiền cọc cho số lượng đang chọn, số suất còn lại.
function PreorderBox({ preorder, unitPrice, quantity }: { preorder: PreorderOffer; unitPrice: number; quantity: number }) {
  const deposit = lineDeposit(unitPrice, quantity, preorder.depositPercent);
  return (
    <div className="w-full space-y-1.5 border-3 border-ink bg-raised p-3.5 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <span className="border-2 border-ink bg-ink px-2 py-px font-condensed text-base font-extrabold text-white uppercase">Hàng đặt trước</span>
        <span className="font-semibold">Dự kiến về {formatDate(preorder.expectedAt)}</span>
      </p>
      {canPreorder(preorder) ? (
        <p className="text-muted">
          {preorder.depositPercent >= 100
            ? "Thanh toán đủ khi đặt để giữ suất."
            : preorder.depositPercent > 0
              ? <>Đặt cọc {preorder.depositPercent}% (<strong className="text-fg tabular-nums">{formatVnd(deposit)}</strong>), phần còn lại trả khi nhận hàng.</>
              : "Không cần cọc: giữ suất ngay, trả khi nhận hàng."}
          {preorder.left !== null && ` Còn ${preorder.left} suất.`}
        </p>
      ) : (
        <p className="font-semibold text-brand-strong">Đợt đặt trước đã ngừng nhận hoặc hết suất.</p>
      )}
      {preorder.note && <p className="whitespace-pre-line text-muted">{preorder.note}</p>}
      <p className="text-xs text-muted">Hàng về là được giữ riêng theo thứ tự đặt; cửa hàng báo qua email khi hàng về hoặc khi lịch về thay đổi.</p>
    </div>
  );
}

export function QuantityStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
}) {
  const button = "grid size-10 place-items-center text-fg transition hover:bg-raised disabled:opacity-40";
  return (
    <div className="inline-flex items-center rounded-full border border-line bg-surface" role="group" aria-label={label}>
      <AnimateIcon animateOnTap asChild>
        <button type="button" className={`${button} rounded-l-full`} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Giảm số lượng">
          <Minus className="size-4" aria-hidden />
        </button>
      </AnimateIcon>
      {/* Số chạy lên/xuống như đồng hồ cơ khi đổi số lượng. */}
      <span className="flex min-w-8 justify-center text-sm font-semibold" aria-live="polite">
        <AnimatedNumber value={value} />
      </span>
      <AnimateIcon animateOnTap asChild>
        <button type="button" className={`${button} rounded-r-full`} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Tăng số lượng">
          <Plus className="size-4" aria-hidden />
        </button>
      </AnimateIcon>
    </div>
  );
}

// Mỗi lần thêm vào giỏ là một biến thể (YC-DM-05). Chỉ một biến thể thì không hiện ô chọn.
export function PurchasePanel({ name, variants }: { name: string; variants: ProductVariant[] }) {
  const [variantId, setVariantId] = useState((variants.find((v) => v.isDefault) ?? variants[0])?.id);
  const [quantity, setQuantity] = useState(1);
  // Đồng hồ cho flash sale (theo trình duyệt; máy chủ tính lại khi đặt).
  const now = useNow();
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) return null;
  // Hàng đặt trước bán theo suất còn lại, không theo tồn kho.
  const preorder = variant.preorder;
  const stock = orderableQty(variant.stock, preorder, site.maxQtyPerItem);
  // Flash sale đang chạy: giá sale, tối đa theo suất và số mỗi đơn.
  const live = now !== null && flashState(variant.flash, now) === "live" ? variant.flash : null;
  const unitPrice = live ? live.price : variant.price;
  const max = Math.min(stock, site.maxQtyPerItem, live ? flashLimit(live) : site.maxQtyPerItem);
  const label = variants.length > 1 ? `${name} (${variant.name})` : name;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {variants.length > 1 && (
        <div className="w-full space-y-2">
          <p id="variant-label" className="text-sm font-medium">
            Phiên bản
          </p>
          <RadioGroup value={variantId} onValueChange={setVariantId} aria-labelledby="variant-label">
            {variants.map((v) => (
              <label key={v.id} className={radioCardClass}>
                <RadioGroupItem value={v.id} />
                <span className="flex-1 font-medium">{v.name}</span>
                <span className="tabular-nums">{formatVnd(v.price)}</span>
                {v.preorder ? (
                  <span className="font-semibold text-cobalt">đặt trước</span>
                ) : (
                  <span className={v.stock > 0 ? "text-muted" : "text-danger"}>{v.stock > 0 ? `còn ${v.stock}` : "hết hàng"}</span>
                )}
              </label>
            ))}
          </RadioGroup>
        </div>
      )}
      {preorder && <PreorderBox preorder={preorder} unitPrice={unitPrice} quantity={Math.max(1, Math.min(quantity, max))} />}
      {stock > 0 && <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} label="Số lượng" />}
      {stock > 0 && (
        <p className="order-last w-full text-sm text-muted">
          Tạm tính: <AnimatedVnd amount={unitPrice * Math.min(quantity, max)} className="font-semibold text-fg" />
        </p>
      )}
      <div className="min-w-48 flex-1">
        <AddToCartButton
          id={variant.id}
          name={label}
          stock={stock}
          quantity={Math.min(quantity, max)}
          size="lg"
          full
          preorder={!!preorder}
          label={preorder ? "Đặt trước" : undefined}
        />
      </div>
      <div className="w-full">
        <BuyNowButton id={variant.id} stock={stock} quantity={Math.min(quantity, max)} label={preorder ? "Đặt trước ngay" : undefined} />
      </div>
      {preorder && stock <= 0 && (
        <div className="w-full">
          <StockAlertButton variantId={variant.id} name={label} />
        </div>
      )}
    </div>
  );
}
