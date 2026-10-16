"use client";

import { useActionState } from "react";
import Link from "next/link";
import { adminLoginAction, loginAction, registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

const ACTIONS = { login: loginAction, register: registerAction, admin: adminLoginAction };

// mode "admin" là cửa đăng nhập của khu quản trị: phiên riêng, không mời tạo tài khoản.
export function AuthForm({ mode, next }: { mode: keyof typeof ACTIONS; next: string }) {
  const isLogin = mode !== "register";
  const [state, action, pending] = useActionState(ACTIONS[mode], INITIAL);
  const other = `${isLogin ? "/dang-ky" : "/dang-nhap"}${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-6">
      <input type="hidden" name="next" value={next} />
      {state.message && <Notice tone="error">{state.message}</Notice>}
      {!isLogin && (
        <Field label="Họ và tên" name="name" required autoComplete="name" defaultValue={state.values?.name} error={state.errors?.name} />
      )}
      <Field label="Email" name="email" type="email" required autoComplete="email" defaultValue={state.values?.email} error={state.errors?.email} />
      {!isLogin && (
        <Field label="Số điện thoại" name="phone" type="tel" autoComplete="tel" defaultValue={state.values?.phone} error={state.errors?.phone} hint="Không bắt buộc." />
      )}
      <Field
        label="Mật khẩu"
        name="password"
        type="password"
        required
        autoComplete={isLogin ? "current-password" : "new-password"}
        error={state.errors?.password}
        hint={isLogin ? undefined : "Từ 8 ký tự trở lên."}
      />
      {!isLogin && (
        <>
          <Field label="Nhập lại mật khẩu" name="confirm" type="password" required autoComplete="new-password" error={state.errors?.confirm} />
          {/* YC-KH-04: không đánh dấu sẵn đồng ý nhận tin. */}
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="marketingConsent" className="size-4 accent-brand" />
            Nhận tin khuyến mãi, hàng mới qua email
          </label>
        </>
      )}
      <Button type="submit" size="lg" full pending={pending}>
        {isLogin ? "Đăng nhập" : "Tạo tài khoản"}
      </Button>
      {mode !== "admin" && (
        <p className="text-center text-sm text-muted">
          {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
          <Link href={other} className="font-medium text-brand-strong hover:underline">
            {isLogin ? "Đăng ký" : "Đăng nhập"}
          </Link>
        </p>
      )}
    </form>
  );
}
