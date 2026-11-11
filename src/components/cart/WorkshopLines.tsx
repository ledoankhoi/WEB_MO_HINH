import { Wrench } from "lucide-react";
import { formatVnd } from "@/lib/format";
import type { ParsedConfig } from "@/lib/workshop";

// Danh sách tuỳ chọn Xưởng của một dòng hàng (giỏ hàng, thanh toán).
export function WorkshopLines({ config, compact = false }: { config: ParsedConfig; compact?: boolean }) {
  return (
    <ul className={`space-y-0.5 text-xs text-muted ${compact ? "" : "border-l-2 border-brand pl-2"}`}>
      <li className="flex items-center gap-1 font-semibold text-fg">
        <Wrench className="size-3.5" aria-hidden /> Tuỳ biến ở Xưởng
        {config.leadDays > 0 && <span className="font-normal text-muted">(thêm {config.leadDays} ngày xử lý)</span>}
      </li>
      {config.lines.map((line) => (
        <li key={line.group} className="flex justify-between gap-3">
          <span>
            {line.group}: {line.label}
          </span>
          {!compact && <span className="tabular-nums">{line.price > 0 ? `+${formatVnd(line.price)}` : "0 ₫"}</span>}
        </li>
      ))}
    </ul>
  );
}

// Mô tả tuỳ chọn đã lưu trong đơn hàng (order_items.options). Dùng span dạng khối vì nằm trong dòng chữ (span) của dòng
// hàng.
export function OrderOptions({ options }: { options: string }) {
  if (!options) return null;
  return (
    <span className="mt-1 block space-y-0.5 border-l-2 border-brand pl-2 text-xs text-muted">
      <span className="flex items-center gap-1 font-semibold text-fg">
        <Wrench className="size-3.5" aria-hidden /> Tuỳ biến ở Xưởng
      </span>
      {options.split("; ").map((part) => (
        <span key={part} className="block">
          {part}
        </span>
      ))}
    </span>
  );
}
