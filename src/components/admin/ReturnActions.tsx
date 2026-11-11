"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createReturnDocumentAction, decideReturnAction, refundReturnAction } from "@/app/actions/returns";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INPUT = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm";

function useRun() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState | null>(null);
  const run = (action: () => Promise<FormState>) => startTransition(async () => setState(await action()));
  return { pending, state, run };
}

function Result({ state }: { state: FormState | null }) {
  if (!state?.message) return null;
  return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
}

// Duyệt / từ chối (orders.process).
export function DecideReturn({ id, suggested, max }: { id: string; suggested: number; max: number }) {
  const { pending, state, run } = useRun();
  const [amount, setAmount] = useState(String(suggested));
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Số tiền hoàn (đ)</span>
        <input className={INPUT} inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} />
        <span className="text-xs text-muted">Đề xuất {suggested.toLocaleString("vi-VN")} đ (đã trừ giảm giá, chưa gồm phí giao). Tối đa {max.toLocaleString("vi-VN")} đ.</span>
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Ghi chú gửi khách</span>
        <textarea className={`${INPUT} h-20 py-2`} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Bắt buộc khi từ chối" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" pending={pending} onClick={() => run(() => decideReturnAction(id, true, { amount: Number(amount), note }))}>
          Duyệt trả hàng
        </Button>
        <Button
          size="sm"
          variant="danger"
          pending={pending}
          onClick={() => {
            if (window.confirm("Từ chối yêu cầu này?")) run(() => decideReturnAction(id, false, { note }));
          }}
        >
          Từ chối
        </Button>
      </div>
      <Result state={state} />
    </div>
  );
}

// Lập phiếu hàng trả (inventory.draft).
export function CreateReturnDocument({ id }: { id: string }) {
  const { pending, state, run } = useRun();
  const [documentId, setDocumentId] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        pending={pending}
        onClick={() =>
          run(async () => {
            const result = await createReturnDocumentAction(id);
            if (result.documentId) setDocumentId(result.documentId);
            return result;
          })
        }
      >
        Lập phiếu hàng trả
      </Button>
      <Result state={state} />
      {documentId && (
        <Link href={`/admin/kho/phieu/${documentId}`} className="text-sm font-medium text-brand hover:underline">
          Mở phiếu để kiểm hàng và ghi sổ →
        </Link>
      )}
    </div>
  );
}

// Ghi nhận đã hoàn tiền (payments.manage).
export function RefundReturn({ id, amountText }: { id: string; amountText: string }) {
  const { pending, state, run } = useRun();
  const [reference, setReference] = useState("");
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Mã giao dịch chuyển khoản</span>
        <input className={INPUT} maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>
      <Button
        size="sm"
        pending={pending}
        onClick={() => {
          if (window.confirm(`Xác nhận đã chuyển ${amountText} cho khách?`)) run(() => refundReturnAction(id, reference));
        }}
      >
        Ghi nhận đã hoàn tiền
      </Button>
      <Result state={state} />
    </div>
  );
}
