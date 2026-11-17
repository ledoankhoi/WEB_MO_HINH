"use client";

import { daysUntil } from "@/lib/preorder";
import { useNow } from "./FlashPrice";

// Số ngày tới ngày dự kiến về, tính ở trình duyệt theo giờ Việt Nam: trang "Hàng sắp về" được cache nên máy chủ không biết
// hôm nay là ngày nào. Trước khi trình duyệt chạy thì không hiện gì.
export function ArrivalCountdown({ expectedAt }: { expectedAt: number }) {
  const now = useNow();
  if (now === null) return null;
  const days = daysUntil(expectedAt, now);
  return <>{days > 1 ? `Còn ${days} ngày` : days === 1 ? "Ngày mai" : days === 0 ? "Hôm nay" : "Đã qua ngày dự kiến"}</>;
}
