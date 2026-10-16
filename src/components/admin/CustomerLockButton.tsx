"use client";

import { useState, useTransition } from "react";
import { setCustomerActiveAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

export function CustomerLockButton({ id, active }: { id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  return (
    <div className="space-y-2">
      <Button
        variant={active ? "danger" : "secondary"}
        disabled={pending}
        onClick={() => {
          if (active && !window.confirm("Khoá tài khoản này? Khách sẽ bị đăng xuất khỏi mọi thiết bị.")) return;
          startTransition(async () => setResult(await setCustomerActiveAction(id, !active)));
        }}
      >
        {active ? "Khoá tài khoản" : "Mở khoá"}
      </Button>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}
