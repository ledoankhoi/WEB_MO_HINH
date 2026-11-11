"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setChatStatusAction, staffChatReplyAction } from "@/app/actions/chat";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

// Tải lại trang chat định kỳ để thấy tin mới của khách mà không phải bấm.
export function ChatAutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}

export function ChatReplyForm({ threadId }: { threadId: string }) {
  const [state, action, pending] = useActionState(staffChatReplyAction, INITIAL);
  const form = useRef<HTMLFormElement>(null);
  // Gửi xong thì xoá ô nhập.
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />
      {state.message && <Notice tone="error">{state.message}</Notice>}
      <textarea
        name="body"
        rows={3}
        maxLength={1000}
        required
        defaultValue={state.ok ? "" : state.values?.body}
        placeholder="Trả lời khách"
        aria-label="Trả lời khách"
        className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
      />
      <Button type="submit" pending={pending}>
        Gửi
      </Button>
    </form>
  );
}

export function ChatStatusButton({ threadId, status }: { threadId: string; status: "open" | "closed" }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="secondary" pending={pending} onClick={() => startTransition(async () => void (await setChatStatusAction(threadId, status === "open" ? "closed" : "open")))}>
      {status === "open" ? "Đánh dấu đã xong" : "Mở lại"}
    </Button>
  );
}
