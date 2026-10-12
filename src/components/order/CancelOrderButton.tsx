"use client";

import { useState, useTransition } from "react";
import { cancelOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/Button";

export function CancelOrderButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="space-y-2 border-t border-line pt-4">
      <Button
        variant="danger"
        size="sm"
        full
        pending={pending}
        onClick={() => {
          if (!window.confirm("Bạn chắc chắn muốn huỷ đơn hàng này?")) return;
          startTransition(async () => {
            const result = await cancelOrderAction(token);
            setError(result.ok ? "" : (result.message ?? "Không huỷ được đơn hàng."));
          });
        }}
      >
        Huỷ đơn hàng
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
