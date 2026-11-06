"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { Button as PressMotion } from "@animate-ui/react/primitives/buttons/button";
import { buttonClass, type ButtonStyleProps } from "./button-style";

// Liên kết dáng nút, co nhẹ khi bấm. Phải là Client Component: nếu Server Component truyền <Link> làm con cho Slot
// của Animate UI thì lúc dựng HTML trên máy chủ, phần tử con còn là tham chiếu chưa nạp, Slot trả về rỗng và thẻ
// <a> bị thiếu (lỗi hydration).
export function ButtonLink({ variant, size, full, className = "", ...props }: ComponentProps<typeof Link> & ButtonStyleProps) {
  return (
    <PressMotion asChild>
      <Link {...props} className={`${buttonClass({ variant, size, full })} ${className}`} />
    </PressMotion>
  );
}
