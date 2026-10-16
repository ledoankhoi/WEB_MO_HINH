"use client";

import { useTransition } from "react";
import { moderateReviewAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";

// pending → duyệt hoặc ẩn; approved ⇄ hidden.
export function ReviewButtons({ id, status }: { id: string; status: "pending" | "approved" | "hidden" }) {
  const [pending, startTransition] = useTransition();
  const run = (target: "approved" | "hidden") =>
    startTransition(async () => {
      const result = await moderateReviewAction(id, target);
      if (!result.ok) showToast(result.message ?? "Không thực hiện được.", { tone: "error" });
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "approved" && (
        <Button size="sm" pending={pending} onClick={() => run("approved")}>
          Duyệt
        </Button>
      )}
      {status !== "hidden" && (
        <Button size="sm" variant="secondary" pending={pending} onClick={() => run("hidden")}>
          Ẩn
        </Button>
      )}
    </div>
  );
}
