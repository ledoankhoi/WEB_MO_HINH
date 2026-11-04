"use client";

import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "@animate-ui/react/primitives/radix-ui";

// Tabs của Animate UI (API giống hệt Radix). Nền trắng của tab đang chọn được Animate UI chép
// sang một lớp riêng rồi trượt giữa các tab; nội dung đổi có hiệu ứng mờ dần.
export function Tabs({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={`space-y-4 ${className}`} {...props} />;
}

export function TabsList({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={`relative inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-raised p-1 ${className}`}
      {...props}
    />
  );
}

export function TabsTrigger({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={
        "relative h-9 rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted transition-colors " +
        "hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm " +
        className
      }
      {...props}
    />
  );
}

export function TabsContent({ className = "", ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={`outline-none ${className}`} {...props} />;
}
