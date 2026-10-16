"use client";

import { useActionState, useTransition } from "react";
import { adminLogoutAction, changePasswordAction, logoutAction, updateProfileAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PROVINCES } from "@/lib/catalog";
import type { CurrentUser, FormState } from "@/lib/types";

const INITIAL: FormState = {};
const card = "space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6";

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
}

export function ProfileForm({ user }: { user: CurrentUser }) {
  const [state, action, pending] = useActionState(updateProfileAction, INITIAL);
  const value = (name: "name" | "phone" | "address" | "city") => state.values?.[name] ?? user[name];

  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>
      <Result state={state} />
      <Field label="Email" name="email" value={user.email} disabled readOnly />
      <Field label="Họ và tên" name="name" required autoComplete="name" defaultValue={value("name")} error={state.errors?.name} />
      <Field label="Số điện thoại" name="phone" type="tel" autoComplete="tel" defaultValue={value("phone")} error={state.errors?.phone} />
      <Field label="Địa chỉ" name="address" autoComplete="street-address" defaultValue={value("address")} error={state.errors?.address} />
      <SelectField label="Tỉnh / Thành phố" name="city" defaultValue={value("city")} error={state.errors?.city}>
        <option value="">Chưa chọn</option>
        {PROVINCES.map((province) => (
          <option key={province}>{province}</option>
        ))}
      </SelectField>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="marketingConsent" defaultChecked={user.marketingConsent} className="size-4 accent-brand" />
        Nhận tin khuyến mãi, hàng mới qua email
      </label>
      <Button type="submit" pending={pending}>
        Lưu thay đổi
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL);
  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
      <Result state={state} />
      <Field label="Mật khẩu hiện tại" name="current" type="password" required autoComplete="current-password" error={state.errors?.current} />
      <Field label="Mật khẩu mới" name="password" type="password" required autoComplete="new-password" error={state.errors?.password} />
      <Field label="Nhập lại mật khẩu mới" name="confirm" type="password" required autoComplete="new-password" error={state.errors?.confirm} />
      <Button type="submit" variant="secondary" pending={pending}>
        Đổi mật khẩu
      </Button>
    </form>
  );
}

// admin: đăng xuất phiên của khu quản trị (cookie riêng), không đụng tới phiên ở cửa hàng.
export function LogoutButton({ admin = false }: { admin?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          await (admin ? adminLogoutAction() : logoutAction());
          // Tải lại toàn bộ trang để xoá mọi trạng thái còn giữ của tài khoản vừa đăng xuất.
          window.location.assign(admin ? "/admin/dang-nhap" : "/");
        })
      }
    >
      Đăng xuất
    </Button>
  );
}
