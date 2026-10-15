"use client";

import { useActionState, useState, useTransition } from "react";
import { createStaffAction, updateStaffAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ROLES, ROLE_LABELS, isStaffRole, type StaffRole } from "@/lib/permissions";
import type { FormState } from "@/lib/types";

const STAFF_ROLES = ROLES.filter(isStaffRole);
const INITIAL: FormState = {};

export function CreateStaffForm() {
  const [state, action, pending] = useActionState(createStaffAction, INITIAL);
  // Tạo xong thì dựng lại form để xoá các ô đã nhập.
  const values = state.ok ? {} : (state.values ?? {});

  return (
    <form action={action} key={state.ok ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Tạo tài khoản nhân viên</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ và tên" name="name" required maxLength={80} defaultValue={values.name} error={state.errors?.name} />
        <Field label="Email" name="email" type="email" required defaultValue={values.email} error={state.errors?.email} />
        <SelectField label="Vai trò" name="role" required defaultValue={values.role ?? ""} error={state.errors?.role}>
          <option value="" disabled>
            Chọn vai trò
          </option>
          {STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </SelectField>
        <Field
          label="Mật khẩu tạm"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          error={state.errors?.password}
          hint="Nhân viên nên đổi mật khẩu sau lần đăng nhập đầu."
        />
      </div>
      <Button type="submit" pending={pending}>
        Tạo tài khoản
      </Button>
    </form>
  );
}

export function StaffActions({ id, name, role, isActive }: { id: string; name: string; role: StaffRole; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(role);
  const [result, setResult] = useState<FormState>({});

  const run = (change: { role: StaffRole } | { isActive: boolean }, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    startTransition(async () => setResult(await updateStaffAction(id, change)));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`role-${id}`} className="sr-only">
          Vai trò của {name}
        </label>
        <select
          id={`role-${id}`}
          value={selected}
          onChange={(event) => setSelected(event.target.value as StaffRole)}
          className="h-9 rounded-lg border border-line bg-surface px-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
        >
          {STAFF_ROLES.map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || selected === role}
          onClick={() => run({ role: selected }, `Đổi vai trò của ${name} sang ${ROLE_LABELS[selected]}? Người này sẽ bị đăng xuất.`)}
        >
          Lưu vai trò
        </Button>
        <Button
          size="sm"
          variant={isActive ? "danger" : "secondary"}
          disabled={pending}
          onClick={() =>
            run({ isActive: !isActive }, isActive ? `Khoá tài khoản của ${name}? Người này sẽ bị đăng xuất ngay.` : `Mở khoá tài khoản của ${name}?`)
          }
        >
          {isActive ? "Khoá" : "Mở khoá"}
        </Button>
      </div>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}
