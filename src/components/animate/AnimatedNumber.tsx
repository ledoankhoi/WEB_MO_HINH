"use client";

import { SlidingNumber } from "@animate-ui/react/primitives/texts/sliding-number";

// Số chạy kiểu đồng hồ cơ (Animate UI SlidingNumber). Định dạng giống formatNumber/formatVnd
// (dấu chấm ngăn hàng nghìn) để không lệch so với chỗ còn hiển thị chữ thường.
// `initiallyStable`: lần dựng đầu hiện ngay giá trị thật, chỉ chạy hiệu ứng khi giá trị đổi.
export function AnimatedNumber({ value, className = "" }: { value: number; className?: string }) {
  return (
    <SlidingNumber
      number={Math.round(value)}
      thousandSeparator="."
      initiallyStable
      className={`inline-flex tabular-nums ${className}`}
    />
  );
}

export function AnimatedVnd({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap tabular-nums ${className}`}>
      {amount < 0 && "−"}
      <AnimatedNumber value={Math.abs(amount)} />
      {" ₫"}
    </span>
  );
}
