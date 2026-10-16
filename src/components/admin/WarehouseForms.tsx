"use client";

import { useActionState, useState, useTransition } from "react";
import { saveLocationAction, saveSupplierAction, setLocationActiveAction, setSupplierActiveAction, setThresholdAction } from "@/app/actions/inventory";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";
import type { Location, Supplier } from "@/server/repo/warehouse";

const INITIAL: FormState = {};

function FormShell({
  title,
  state,
  action,
  pending,
  editing,
  basePath,
  submit,
  children,
}: {
  title: string;
  state: FormState;
  action: (form: FormData) => void;
  pending: boolean;
  editing: boolean;
  basePath: string;
  submit: string;
  children: React.ReactNode;
}) {
  return (
    // Tạo xong thì dựng lại form để xoá các ô đã nhập.
    <form action={action} key={state.ok && !editing ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {submit}
        </Button>
        {editing && (
          <ButtonLink href={basePath} variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function LocationForm({ location }: { location?: Location }) {
  const [state, action, pending] = useActionState(saveLocationAction, INITIAL);
  const values = state.ok && !location ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  return (
    <FormShell
      title={location ? `Sửa vị trí ${location.code}` : "Thêm vị trí"}
      state={state}
      action={action}
      pending={pending}
      editing={Boolean(location)}
      basePath="/admin/kho/vi-tri"
      submit={location ? "Lưu thay đổi" : "Thêm vị trí"}
    >
      {location && <input type="hidden" name="id" value={location.id} />}
      <Field label="Mã vị trí" name="code" required maxLength={30} defaultValue={value("code", location?.code ?? "")} error={state.errors?.code} hint="Ví dụ A-01-02-03 (khu-kệ-tầng-ô)." />
      <Field label="Tên" name="name" maxLength={80} defaultValue={value("name", location?.name ?? "")} error={state.errors?.name} />
      <SelectField label="Loại" name="type" required defaultValue={value("type", location?.type ?? "storage")} error={state.errors?.type}>
        <option value="storage">Kệ hàng (bán được)</option>
        <option value="quarantine">Khu cách ly (không bán)</option>
      </SelectField>
    </FormShell>
  );
}

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const [state, action, pending] = useActionState(saveSupplierAction, INITIAL);
  const values = state.ok && !supplier ? {} : (state.values ?? {});
  const value = (key: keyof Supplier) => values[key] ?? String(supplier?.[key] ?? "");
  return (
    <FormShell
      title={supplier ? `Sửa nhà cung cấp ${supplier.name}` : "Thêm nhà cung cấp"}
      state={state}
      action={action}
      pending={pending}
      editing={Boolean(supplier)}
      basePath="/admin/nha-cung-cap"
      submit={supplier ? "Lưu thay đổi" : "Thêm nhà cung cấp"}
    >
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <Field label="Mã" name="code" required maxLength={30} defaultValue={value("code")} error={state.errors?.code} />
      <Field label="Tên" name="name" required maxLength={120} defaultValue={value("name")} error={state.errors?.name} />
      <Field label="Người liên hệ" name="contactName" maxLength={80} defaultValue={value("contactName")} error={state.errors?.contactName} />
      <Field label="Điện thoại" name="phone" type="tel" maxLength={20} defaultValue={value("phone")} error={state.errors?.phone} />
      <Field label="Email" name="email" type="email" maxLength={120} defaultValue={value("email")} error={state.errors?.email} />
      <Field label="Địa chỉ" name="address" maxLength={200} defaultValue={value("address")} error={state.errors?.address} />
      <div className="sm:col-span-2">
        <TextAreaField label="Ghi chú" name="note" maxLength={500} defaultValue={value("note")} error={state.errors?.note} />
      </div>
    </FormShell>
  );
}

// Ngừng dùng / dùng lại một vị trí hoặc nhà cung cấp.
export function ActiveToggle({ kind, id, active }: { kind: "location" | "supplier"; id: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const action = kind === "location" ? setLocationActiveAction : setSupplierActiveAction;
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => startTransition(async () => setResult(await action(id, !active)))}>
        {active ? "Ngừng dùng" : "Dùng lại"}
      </Button>
      {result.message && !result.ok && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}

export function ThresholdForm({ variantId, threshold }: { variantId: string; threshold: number }) {
  const [value, setValue] = useState(String(threshold));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setResult(await setThresholdAction(variantId, Number(value))));
      }}
    >
      <div className="w-40">
        <Field label="Ngưỡng sắp hết" name="threshold" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
      </div>
      <Button type="submit" size="sm" variant="secondary" pending={pending}>
        Lưu ngưỡng
      </Button>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </form>
  );
}
