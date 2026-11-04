import Link from "next/link";
import { ACTION_STAGES, ORDER_STAGES, ORDER_STAGE_KEYS, type OrderStageKey } from "@/lib/order-stage";

const TONE_RING = {
  urgent: "border-warning/40 bg-warning/5",
  danger: "border-danger/40 bg-danger/5",
  wait: "border-line bg-surface",
  done: "border-line bg-surface",
  muted: "border-line bg-surface",
} as const;

const TONE_TEXT = { urgent: "text-warning", danger: "text-danger", wait: "text-brand-strong", done: "text-success", muted: "text-muted" } as const;

// Bảng việc của đơn hàng: mỗi ô là một bước xử lý kèm số đơn, bấm vào thì lọc danh sách theo bước đó.
// Ô có đơn cần làm ngay được tô màu; bước đã xong (hoàn tất, đã huỷ) ẩn khi `compact`.
export function StageBoard({
  counts,
  active,
  href,
  compact = false,
}: {
  counts: Record<OrderStageKey, number>;
  active?: OrderStageKey;
  href: (stage: OrderStageKey | "") => string;
  compact?: boolean;
}) {
  const keys = compact ? ORDER_STAGE_KEYS.filter((key) => key !== "hoan-tat" && key !== "da-huy") : ORDER_STAGE_KEYS;
  const needs = ACTION_STAGES.reduce((sum, key) => sum + counts[key], 0);
  return (
    <section aria-label="Đơn hàng theo bước xử lý" className="space-y-3">
      <p className="text-sm">
        {needs > 0 ? (
          <>
            <span className="font-semibold text-warning">{needs} đơn cần xử lý ngay.</span>{" "}
            <span className="text-muted">Bấm vào từng ô để xem đúng các đơn đó.</span>
          </>
        ) : (
          <span className="text-muted">Không có đơn nào đang chờ cửa hàng xử lý.</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {keys.map((key) => {
          const stage = ORDER_STAGES[key];
          const count = counts[key];
          const hot = count > 0 && (stage.tone === "urgent" || stage.tone === "danger");
          const selected = active === key;
          return (
            <Link
              key={key}
              href={selected ? href("") : href(key)}
              aria-current={selected ? "true" : undefined}
              className={`rounded-xl border p-3.5 transition hover:border-fg/40 ${hot ? TONE_RING[stage.tone] : "border-line bg-surface"} ${selected ? "ring-2 ring-fg" : ""}`}
            >
              <span className={`block text-2xl font-bold tabular-nums ${hot ? TONE_TEXT[stage.tone] : count === 0 ? "text-muted/60" : ""}`}>{count}</span>
              <span className="mt-0.5 block text-xs leading-snug font-medium text-muted">{stage.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
