"use client";

import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";

// Số chạy từ 0 lên giá trị thật khi cuộn tới (một lần), dấu chấm ngăn hàng nghìn như formatNumber. Trình đọc màn hình
// đọc thẳng giá trị thật (SlidingNumber có sẵn chữ sr-only); bật giảm chuyển động thì hiện ngay giá trị thật.
export function CountUp({ value, className = "" }: { value: number; className?: string }) {
  return <SlidingNumber number={Math.round(value)} fromNumber={0} inView inViewOnce thousandSeparator="." className={`inline-flex tabular-nums ${className}`} />;
}
