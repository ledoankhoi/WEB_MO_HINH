import { Check, X } from "lucide-react";
import { ORDER_STEPS, orderProgress } from "@/lib/order-stage";
import type { Order } from "@/lib/types";

// Thanh tiến trình của đơn: Đặt hàng → Xác nhận → Đóng gói → Bàn giao vận chuyển → Đã giao → Hoàn tất.
// Mốc đã xong có dấu tích, mốc đang làm được tô viền, mốc gặp sự cố (huỷ, giao thất bại) màu đỏ.
export function OrderProgress({ order }: { order: Pick<Order, "status" | "paymentStatus" | "shippingStatus" | "paymentMethod"> }) {
  const { done, problem } = orderProgress(order);
  return (
    <ol aria-label="Tiến trình đơn hàng" className="grid grid-cols-3 gap-y-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-6 sm:p-5">
      {ORDER_STEPS.map((label, index) => {
        const finished = index < done;
        const failed = problem === index;
        const current = !finished && !failed && index === done && order.status !== "cancelled";
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center">
            {index > 0 && (
              <span aria-hidden className={`absolute top-4 right-1/2 hidden h-0.5 w-full -translate-y-1/2 sm:block ${index <= done ? "bg-success" : "bg-line"}`} />
            )}
            <span
              className={`relative grid size-8 place-items-center rounded-full text-sm font-bold ${
                failed ? "bg-danger text-white" : finished ? "bg-success text-white" : current ? "border-2 border-brand bg-surface text-brand-strong" : "border border-line bg-raised text-muted"
              }`}
            >
              {failed ? <X className="size-4" aria-hidden /> : finished ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={`text-xs leading-tight font-medium ${failed ? "text-danger" : finished || current ? "text-fg" : "text-muted"}`}>
              {label}
              {failed && <span className="block font-normal">{order.status === "cancelled" ? "Đã huỷ" : "Có sự cố"}</span>}
              {current && <span className="block font-normal text-brand-strong">Đang ở bước này</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
