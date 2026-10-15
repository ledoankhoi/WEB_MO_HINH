"use client";

import { useActionState } from "react";
import { lookupOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

export function LookupForm() {
  const [state, action, pending] = useActionState(lookupOrderAction, INITIAL);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <Field label="Mã đơn hàng" name="code" required placeholder="Ví dụ: RB7K3M9QXT" autoCapitalize="characters" defaultValue={state.values?.code} />
      <Field label="Số điện thoại" name="phone" type="tel" required autoComplete="tel" defaultValue={state.values?.phone} />
      <Button type="submit" size="lg" full pending={pending}>
        Tra cứu
      </Button>
    </form>
  );
}
