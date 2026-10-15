"use client";

import { useState, useTransition } from "react";
import { advanceOrderAction, cancelOrderAsAdminAction, setPaymentStatusAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ORDER_TRANSITIONS, type OrderStatus } from "@/lib/catalog";
import type { FormState, Order } from "@/lib/types";

const NEXT_STEP_LABELS: Partial<Record<OrderStatus, string>> = {
  confirmed: "Xác nhận đơn",
  shipping: "Giao cho đơn vị vận chuyển",
  completed: "Hoàn tất đơn",
};

export function OrderActions({ id, status, paymentMethod, paymentStatus }: Pick<Order, "id" | "status" | "paymentMethod" | "paymentStatus">) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});

  const run = (action: () => Promise<FormState>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => setResult(await action()));
  };

  const next = ORDER_TRANSITIONS[status].find((to) => to !== "cancelled");
  const canCancel = ORDER_TRANSITIONS[status].includes("cancelled");
  // Đơn chuyển khoản phải thu tiền xong mới xác nhận, tránh giao hàng khi chưa nhận được tiền.
  const awaitingTransfer = status === "pending" && paymentMethod === "bank" && paymentStatus === "unpaid";
  const canMarkPaid = paymentStatus === "unpaid" && status !== "cancelled";
  const canRefund = paymentStatus === "paid" && status === "cancelled";

  if (!next && !canCancel && !canMarkPaid && !canRefund) return null;

  return (
    <section aria-label="Xử lý đơn hàng" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <div className="flex flex-wrap gap-3">
        {next && (
          <Button disabled={pending || awaitingTransfer} onClick={() => run(() => advanceOrderAction(id, next))}>
            {NEXT_STEP_LABELS[next]}
          </Button>
        )}
        {canMarkPaid && (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setPaymentStatusAction(id, "paid"), "Xác nhận đã nhận đủ tiền của đơn này?")}>
            Ghi nhận đã thu tiền
          </Button>
        )}
        {canRefund && (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => setPaymentStatusAction(id, "refunded"), "Xác nhận đã hoàn tiền cho khách?")}>
            Ghi nhận đã hoàn tiền
          </Button>
        )}
        {canCancel && (
          <Button variant="danger" disabled={pending} onClick={() => run(() => cancelOrderAsAdminAction(id), "Huỷ đơn này và hoàn hàng về kho?")}>
            Huỷ đơn
          </Button>
        )}
      </div>
      {awaitingTransfer && <p className="text-xs text-muted">Đơn chuyển khoản: ghi nhận đã thu tiền trước khi xác nhận đơn.</p>}
    </section>
  );
}
