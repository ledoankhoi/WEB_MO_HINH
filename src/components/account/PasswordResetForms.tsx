"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordResetAction, resetPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, INITIAL);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <p className="text-sm text-muted">Nhập email đã đăng ký. Chúng tôi sẽ gửi liên kết đặt mật khẩu mới, dùng được trong 30 phút.</p>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <Field label="Email" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} error={state.errors?.email} />
      <Button type="submit" size="lg" full pending={pending}>
        Gửi liên kết đặt lại
      </Button>
      <p className="text-center text-sm text-muted">
        Nhớ ra mật khẩu?{" "}
        <Link href="/dang-nhap" className="font-medium text-brand-strong hover:underline">
          Đăng nhập
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <input type="hidden" name="token" value={token} />
      {state.message && (
        <Notice tone="error">
          {state.message}{" "}
          <Link href="/quen-mat-khau" className="font-semibold underline">
            Gửi liên kết mới
          </Link>
        </Notice>
      )}
      <Field label="Mật khẩu mới" name="password" type="password" required autoComplete="new-password" error={state.errors?.password} hint="Từ 8 ký tự trở lên." />
      <Field label="Nhập lại mật khẩu mới" name="confirm" type="password" required autoComplete="new-password" error={state.errors?.confirm} />
      <Button type="submit" size="lg" full pending={pending}>
        Đặt mật khẩu mới
      </Button>
      <p className="text-center text-xs text-muted">Sau khi đổi, mọi thiết bị đang đăng nhập sẽ bị đăng xuất.</p>
    </form>
  );
}
