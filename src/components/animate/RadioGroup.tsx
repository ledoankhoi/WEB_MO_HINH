"use client";

import type { ComponentProps } from "react";
import { RadioGroup as RadioGroupPrimitive } from "@animate-ui/react/primitives/radix-ui";

// RadioGroup của Animate UI. Truyền `name` cho Root thì Radix tự thêm ô input ẩn, nên dùng được
// trong <form> gửi Server Action như radio thường.
export function RadioGroup({ className = "", ...props }: ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={`grid gap-2 ${className}`} {...props} />;
}

// Ô tròn có chấm giữa bật ra khi chọn.
export function RadioGroupItem({ className = "", ...props }: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={
        "relative grid size-5 shrink-0 place-items-center rounded-full border-2 border-line bg-surface transition-colors " +
        "data-[state=checked]:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none " +
        "disabled:cursor-not-allowed disabled:opacity-50 " +
        className
      }
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="grid place-items-center">
        <span className="size-2.5 rounded-full bg-brand" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

// Thẻ lựa chọn: cả khung bấm được, viền và nền đổi màu khi chọn.
export const radioCardClass =
  "flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm transition " +
  "hover:border-fg/30 has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5";
