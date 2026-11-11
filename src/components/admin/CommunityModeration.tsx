"use client";

import { useState, useTransition } from "react";
import { dismissReportAction, moderatePostAction, setCommentStatusAction } from "@/app/actions/community";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/components/ui/Toaster";
import type { FormState } from "@/lib/types";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await task();
      if (!result.ok) showToast(result.message ?? "Không thực hiện được.", { tone: "error" });
    });
  return { pending, run };
}

// Duyệt hoặc ẩn một bài; ẩn thì có thể ghi lý do cho tác giả.
export function PostModerationButtons({ id, status }: { id: string; status: "pending" | "approved" | "hidden" }) {
  const { pending, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "approved" && (
          <Button size="sm" pending={pending} onClick={() => run(() => moderatePostAction(id, "approved", ""))}>
            Duyệt
          </Button>
        )}
        {status !== "hidden" && (
          <Button size="sm" variant="secondary" pending={pending} onClick={() => run(() => moderatePostAction(id, "hidden", note))}>
            Ẩn
          </Button>
        )}
      </div>
      {status !== "hidden" && (
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
          placeholder="Lý do ẩn (gửi tác giả, không bắt buộc)"
          className="h-9 w-full rounded-lg border border-line px-2 text-xs"
        />
      )}
    </div>
  );
}

export function CommentModerationButton({ id, status }: { id: string; status: "visible" | "hidden" }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" pending={pending} onClick={() => run(() => setCommentStatusAction(id, status === "visible" ? "hidden" : "visible"))}>
      {status === "visible" ? "Ẩn bình luận" : "Hiện lại"}
    </Button>
  );
}

export function DismissReportButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" pending={pending} onClick={() => run(() => dismissReportAction(id))}>
      Bỏ qua
    </Button>
  );
}
