"use client";

import type { ComponentProps } from "react";
import { Checkbox as CheckboxPrimitive } from "@animate-ui/react/primitives/radix-ui";

// Checkbox của Animate UI: dấu tích được vẽ dần khi chọn. Có `name` thì Radix gửi giá trị "on"
// trong FormData giống <input type="checkbox">.
export function Checkbox({ className = "", ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={
        "relative grid size-5 shrink-0 place-items-center rounded-md border-2 border-line bg-surface text-brand-ink transition-colors " +
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand " +
        "focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none disabled:opacity-50 " +
        className
      }
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-items-center">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
