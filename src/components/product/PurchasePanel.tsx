"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import type { ProductVariant } from "@/lib/types";
import { AddToCartButton } from "./AddToCartButton";

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
      <button type="button" className={`${button} rounded-l-full`} onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Giảm số lượng">
        <Minus className="size-4" aria-hidden />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className={`${button} rounded-r-full`} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Tăng số lượng">
        <Plus className="size-4" aria-hidden />
      </button>
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
        <fieldset className="w-full space-y-2">
          <legend className="mb-2 text-sm font-medium">Phiên bản</legend>
          {variants.map((v) => (
            <label key={v.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-brand">
              <input type="radio" name="variant" value={v.id} checked={v.id === variantId} onChange={() => setVariantId(v.id)} className="accent-brand" />
              <span className="flex-1 font-medium">{v.name}</span>
              <span className="tabular-nums">{formatVnd(v.price)}</span>
              <span className={v.stock > 0 ? "text-muted" : "text-danger"}>{v.stock > 0 ? `còn ${v.stock}` : "hết hàng"}</span>
            </label>
          ))}
        </fieldset>
      )}
      {stock > 0 && <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} label="Số lượng" />}
      <div className="min-w-48 flex-1">
        <AddToCartButton id={variant.id} name={label} stock={stock} quantity={Math.min(quantity, max)} size="lg" full />
      </div>
    </div>
  );
}
