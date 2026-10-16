"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function PrintButton() {
  return (
    <Button size="sm" variant="secondary" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" aria-hidden />
      In danh sách
    </Button>
  );
}
