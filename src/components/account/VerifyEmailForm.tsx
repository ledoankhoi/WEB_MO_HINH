"use client";

import { useActionState, useState, useTransition } from "react";
import { sendVerifyEmailOtpAction, verifyEmailAction } from "@/app/actions/otp";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

// Nhập mã OTP gửi tới email để xác thực tài khoản (nghiep-vu-ban-hang mục 15); có nút gửi lại mã.
export function VerifyEmailForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, INITIAL);
  const [resend, setResend] = useState<FormState | null>(null);
  const [sending, startSending] = useTransition();
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <p className="text-sm text-muted">
        Mã 6 số đã được gửi tới <strong className="text-fg">{email}</strong>. Mã có hiệu lực 10 phút.
      </p>
      <input type="hidden" name="next" value={next} />
      <Field label="Mã xác thực" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required error={state.errors?.code} />
      {resend?.message && <Notice tone={resend.ok ? "success" : "error"}>{resend.message}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          Xác thực
        </Button>
        <Button type="button" variant="secondary" pending={sending} onClick={() => startSending(async () => setResend(await sendVerifyEmailOtpAction()))}>
          Gửi lại mã
        </Button>
      </div>
    </form>
  );
}
