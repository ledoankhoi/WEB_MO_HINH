"use client";

import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "@animate-ui/react/primitives/radix-ui";

// Công tắc của Animate UI: núm trượt có độ nảy. Có `name` thì gửi "on" trong FormData như checkbox.
export function Switch({ className = "", ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-line p-0.5 transition-colors " +
        "data-[state=checked]:bg-brand " +
        "focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none disabled:opacity-50 " +
        className
      }
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
