"use client";

import { useActionState, useTransition } from "react";
import { moderateAnswerAction, moderateQuestionAction, staffAnswerAction } from "@/app/actions/questions";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { showToast } from "@/components/ui/Toaster";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

// Hiện hoặc ẩn một câu hỏi, câu trả lời.
export function ModerateButton({ kind, id, status }: { kind: "question" | "answer"; id: string; status: "approved" | "hidden" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await (kind === "question" ? moderateQuestionAction : moderateAnswerAction)(id, status);
          if (!result.ok) showToast(result.message ?? "Không thực hiện được.", { tone: "error" });
        })
      }
    >
      {status === "approved" ? "Hiện" : "Ẩn"}
    </Button>
  );
}

// Nhân viên trả lời: hiện ngay trên trang sản phẩm, người hỏi nhận email.
export function StaffAnswerForm({ questionId }: { questionId: string }) {
  const [state, action, pending] = useActionState(staffAnswerAction, INITIAL);
  return (
    <form action={action} key={state.ok ? "done" : "form"} className="space-y-2">
      <input type="hidden" name="questionId" value={questionId} />
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <textarea
        name="body"
        rows={2}
        maxLength={1000}
        required
        defaultValue={state.ok ? "" : state.values?.body}
        placeholder="Trả lời của cửa hàng"
        aria-label="Trả lời của cửa hàng"
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
      />
      <Button type="submit" size="sm" pending={pending}>
        Trả lời
      </Button>
    </form>
  );
}
