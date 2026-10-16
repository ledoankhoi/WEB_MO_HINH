"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteNavItemAction, saveNavItemAction, saveSettingsAction } from "@/app/actions/content";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";
import type { NavItem, SettingKey } from "@/server/repo/content";

const INITIAL: FormState = {};
const card = "space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6";

export function NavItemForm({ item }: { item?: NavItem }) {
  const [state, action, pending] = useActionState(saveNavItemAction, INITIAL);
  const values = state.ok && !item ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok && !item ? state.message : "form"} className={card}>
      <h2 className="text-lg font-semibold">{item ? `Sửa mục ${item.label}` : "Thêm mục menu"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Menu" name="menu" defaultValue={value("menu", item?.menu ?? "header")} error={errors.menu}>
          <option value="header">Đầu trang</option>
          <option value="footer">Chân trang (Hỗ trợ)</option>
        </SelectField>
        <Field label="Nhãn" name="label" required maxLength={40} defaultValue={value("label", item?.label ?? "")} error={errors.label} />
        <Field label="Liên kết" name="url" required maxLength={300} placeholder="/san-pham?loai=transformers" defaultValue={value("url", item?.url ?? "")} error={errors.url} hint="Nội bộ phải là trang có thật; bên ngoài phải là https://." />
        <Field label="Thứ tự" name="sortOrder" type="number" min={0} max={999} defaultValue={value("sortOrder", String(item?.sortOrder ?? 0))} error={errors.sortOrder} />
      </div>
      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={item ? item.isActive : true} className="size-4 accent-brand" />
        Đang hiện trên cửa hàng
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {item ? "Lưu" : "Thêm"}
        </Button>
        {item && (
          <ButtonLink href="/admin/noi-dung/menu" variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function DeleteNavButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  return (
    <>
      <Button size="sm" variant="danger" disabled={pending} onClick={() => window.confirm("Xoá mục menu này?") && startTransition(async () => setResult(await deleteNavItemAction(id)))}>
        Xoá
      </Button>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </>
  );
}

export type SettingField = { name: string; label: string; type?: string; hint?: string; defaultValue: string; checkbox?: boolean };

// Một nhóm cài đặt hiển thị (thanh thông báo, liên hệ, chính sách).
export function SettingsForm({ settingKey, title, fields }: { settingKey: SettingKey; title: string; fields: SettingField[] }) {
  const [state, action, pending] = useActionState(saveSettingsAction.bind(null, settingKey), INITIAL);
  const errors = state.errors ?? {};
  return (
    <form action={action} className={card}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) =>
          field.checkbox ? (
            <label key={field.name} className="flex items-center gap-2.5 text-sm sm:col-span-2">
              <input type="checkbox" name={field.name} defaultChecked={field.defaultValue === "on"} className="size-4 accent-brand" />
              {field.label}
            </label>
          ) : (
            <Field
              key={field.name}
              label={field.label}
              name={field.name}
              type={field.type}
              hint={field.hint}
              defaultValue={state.values?.[field.name] ?? field.defaultValue}
              error={errors[field.name]}
            />
          ),
        )}
      </div>
      <Button type="submit" pending={pending}>
        Lưu
      </Button>
    </form>
  );
}
