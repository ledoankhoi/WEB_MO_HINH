"use client";

import { useState, useTransition } from "react";
import { orderAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";

// Ghi nhận tiền chuyển khoản ngay trên danh sách: L15 (cọc) hoặc L2 (cả đơn), kèm mã giao dịch ngân hàng để đối soát.
export function TransferConfirm({ id, deposit, amountText }: { id: string; deposit: boolean; amountText: string }) {
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null);
  if (result?.ok) return <p className="text-xs text-success">{result.message}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          aria-label="Mã giao dịch ngân hàng"
          placeholder="Mã giao dịch (FT...)"
          maxLength={120}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          className="h-9 w-40 rounded-lg border border-line bg-surface px-2 text-sm"
        />
        <Button
          size="sm"
          pending={pending}
          onClick={() => {
            if (!window.confirm(`Xác nhận đã nhận ${amountText} trong sổ ngân hàng?`)) return;
            startTransition(async () => setResult(await orderAction(id, deposit ? "mark_deposit" : "mark_paid", { reference })));
          }}
        >
          Đã nhận tiền
        </Button>
      </div>
      {result?.message && (
        <p role="alert" className="text-xs text-danger">
          {result.message}
        </p>
      )}
    </div>
  );
}
