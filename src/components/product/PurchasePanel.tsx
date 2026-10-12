"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { site } from "@/config/site";
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

export function PurchasePanel({ id, name, stock }: { id: string; name: string; stock: number }) {
  const [quantity, setQuantity] = useState(1);
  const max = Math.min(stock, site.maxQtyPerItem);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {stock > 0 && <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} label="Số lượng" />}
      <div className="min-w-48 flex-1">
        <AddToCartButton id={id} name={name} stock={stock} quantity={Math.min(quantity, max)} size="lg" full />
      </div>
    </div>
  );
}
