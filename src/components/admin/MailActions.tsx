"use client";

import { useActionState } from "react";
import { retryMailAction, sendTestMailAction } from "@/app/actions/email";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

export function MailActions({ configured }: { configured: boolean }) {
  const [testState, testAction, testing] = useActionState(sendTestMailAction, INITIAL);
  const [retryState, retryAction, retrying] = useActionState(retryMailAction, INITIAL);
  const state = retryState.message ? retryState : testState;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <form action={testAction}>
          <Button type="submit" variant="secondary" pending={testing}>
            Gửi thư thử cho tôi
          </Button>
        </form>
        {configured && (
          <form action={retryAction}>
            <Button type="submit" variant="secondary" pending={retrying}>
              Gửi lại các thư lỗi
            </Button>
          </form>
        )}
      </div>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
    </div>
  );
}
