"use client";

import { useState, useTransition } from "react";
import { orderAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ORDER_ACTIONS, type OrderActionKey } from "@/lib/order-flow";
import type { FormState } from "@/lib/types";

const DANGER: OrderActionKey[] = ["cancel", "receive_return", "delivery_failed"];

// \`allowed\`: các thao tác máy chủ đã tính là đúng điều kiện và đúng quyền của người đang xem.
export function OrderActions({ id, allowed }: { id: string; allowed: OrderActionKey[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const [extra, setExtra] = useState({ carrier: "", code: "", reference: "" });

  if (allowed.length === 0) return null;

  const run = (key: OrderActionKey) => {
    const action = ORDER_ACTIONS[key];
    if ("confirm" in action && !window.confirm(action.confirm)) return;
    startTransition(async () => setResult(await orderAction(id, key, extra)));
  };
  const input = (name: keyof typeof extra) => ({
    name,
    value: extra[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setExtra({ ...extra, [name]: event.target.value }),
  });

  return (
    <section aria-label="Xử lý đơn hàng" className="space-y-4 rounded-xl border border-line bg-surface p-5">
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      {allowed.includes("hand_over") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hãng vận chuyển" placeholder="Ví dụ: GHN" maxLength={60} {...input("carrier")} />
          <Field label="Mã vận đơn" maxLength={60} {...input("code")} />
        </div>
      )}
      {(allowed.includes("mark_paid") || allowed.includes("refund")) && (
        <Field label="Mã giao dịch, ghi chú đối soát (không bắt buộc)" maxLength={120} {...input("reference")} />
      )}
      <div className="flex flex-wrap gap-3">
        {allowed.map((key) => (
          <Button key={key} variant={DANGER.includes(key) ? "danger" : key === allowed[0] ? "primary" : "secondary"} disabled={pending} onClick={() => run(key)}>
            {ORDER_ACTIONS[key].label}
          </Button>
        ))}
      </div>
    </section>
  );
}
