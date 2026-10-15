"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteTaxonomyAction, saveTaxonomyAction } from "@/app/actions/admin";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";
import type { TaxonomyItem, TaxonomyKind } from "@/server/repo/taxonomy";

const INITIAL: FormState = {};

// Form tạo (không có `item`) hoặc sửa một danh mục, thương hiệu, series. `parents` là các danh mục gốc.
export function TaxonomyForm({
  kind,
  label,
  basePath,
  item,
  parents = [],
}: {
  kind: TaxonomyKind;
  label: string;
  basePath: string;
  item?: TaxonomyItem;
  parents?: TaxonomyItem[];
}) {
  const [state, action, pending] = useActionState(saveTaxonomyAction.bind(null, kind), INITIAL);
  // Tạo xong thì dựng lại form để xoá các ô đã nhập.
  const values = state.ok && !item ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;

  return (
    <form action={action} key={state.ok && !item ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{item ? `Sửa ${label} ${item.name}` : `Thêm ${label}`}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên" name="name" required maxLength={80} defaultValue={value("name", item?.name ?? "")} error={state.errors?.name} />
        <Field
          label="Đường dẫn (slug)"
          name="slug"
          maxLength={80}
          defaultValue={value("slug", item?.slug ?? "")}
          error={state.errors?.slug}
          hint="Để trống thì tạo từ tên."
        />
        {kind === "categories" && (
          <>
            <SelectField label="Danh mục cha" name="parentId" defaultValue={value("parentId", item?.parentId ?? "")} error={state.errors?.parentId}>
              <option value="">Không có (danh mục gốc)</option>
              {parents
                .filter((parent) => parent.id !== item?.id)
                .map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.name}
                  </option>
                ))}
            </SelectField>
            <Field
              label="Thứ tự"
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              defaultValue={value("sortOrder", String(item?.sortOrder ?? 0))}
              error={state.errors?.sortOrder}
              hint="Số nhỏ đứng trước."
            />
            <div className="sm:col-span-2">
              <TextAreaField
                label="Mô tả"
                name="description"
                maxLength={500}
                defaultValue={value("description", item?.description ?? "")}
                error={state.errors?.description}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {item ? "Lưu thay đổi" : `Thêm ${label}`}
        </Button>
        {item && (
          <ButtonLink href={basePath} variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function DeleteTaxonomyButton({ kind, id, name }: { kind: TaxonomyKind; id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Xoá ${name}?`)) return;
          startTransition(async () => setResult(await deleteTaxonomyAction(kind, id)));
        }}
      >
        Xoá
      </Button>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}
