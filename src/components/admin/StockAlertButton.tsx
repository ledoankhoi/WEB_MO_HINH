"use client";

import { useTransition } from "react";
import { markStockAlertsNotifiedAction } from "@/app/actions/stock-alerts";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";

// Đánh dấu đã báo khách có hàng (sau khi nhân viên đã liên hệ).
export function MarkNotifiedButton({ ids, label = "Đã báo" }: { ids: string[]; label?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markStockAlertsNotifiedAction(ids);
          if (!result.ok) showToast(result.message ?? "Không thực hiện được.", { tone: "error" });
        })
      }
    >
      {label}
    </Button>
  );
}
