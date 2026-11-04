"use client";

import { useState } from "react";
import { AnimatedNumber, AnimatedVnd } from "@/components/animate/AnimatedNumber";
import { AnimateIcon, Minus, Plus } from "@/components/animate/icons";
import { RadioGroup, RadioGroupItem, radioCardClass } from "@/components/animate/RadioGroup";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import type { ProductVariant } from "@/lib/types";
import { AddToCartButton, BuyNowButton } from "./AddToCartButton";

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
  const variant = variants.find((v) => v.id === variantId);
  if (!variant) return null;
  const stock = variant.stock;
  const max = Math.min(stock, site.maxQtyPerItem);
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
                <span className={v.stock > 0 ? "text-muted" : "text-danger"}>{v.stock > 0 ? `còn ${v.stock}` : "hết hàng"}</span>
              </label>
            ))}
          </RadioGroup>
        </div>
      )}
      {stock > 0 && <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} label="Số lượng" />}
      {stock > 0 && (
        <p className="order-last w-full text-sm text-muted">
          Tạm tính: <AnimatedVnd amount={variant.price * Math.min(quantity, max)} className="font-semibold text-fg" />
        </p>
      )}
      <div className="min-w-48 flex-1">
        <AddToCartButton id={variant.id} name={label} stock={stock} quantity={Math.min(quantity, max)} size="lg" full />
      </div>
      <div className="w-full">
        <BuyNowButton id={variant.id} stock={stock} quantity={Math.min(quantity, max)} />
      </div>
    </div>
  );
}
