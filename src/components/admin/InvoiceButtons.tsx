"use client";

import { useTransition } from "react";
import { Printer } from "lucide-react";
import { issueInvoiceAction } from "@/app/actions/invoices";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";

export function IssueInvoiceButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await issueInvoiceAction(orderId);
          showToast(result.message ?? (result.ok ? "Đã xuất hoá đơn." : "Không thực hiện được."), { tone: result.ok ? "success" : "error" });
        })
      }
    >
      Cấp số hoá đơn
    </Button>
  );
}

export function PrintInvoiceButton() {
  return (
    <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      In / lưu PDF
    </Button>
  );
}
