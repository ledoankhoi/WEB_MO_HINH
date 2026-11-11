"use client";

import { useActionState } from "react";
import { saveDealAction } from "@/app/actions/bundles";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

type Deal = { id: string; name: string; percent: number; isActive: boolean; productIds: string[] };

// Tạo hoặc sửa combo: chọn sản phẩm bằng ô đánh dấu.
export function BundleForm({ deal, products }: { deal?: Deal; products: { id: string; name: string; status: string }[] }) {
  const [state, action, pending] = useActionState(saveDealAction, INITIAL);
  const values = state.ok && !deal ? {} : (state.values ?? {});
  const errors = state.errors ?? {};
  const chosen = new Set(values.productIds !== undefined ? values.productIds.split(",").filter(Boolean) : (deal?.productIds ?? []));
  return (
    <form action={action} key={state.ok && !deal ? state.message : (deal?.id ?? "new")} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{deal ? `Sửa combo ${deal.name}` : "Tạo combo"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {deal && <input type="hidden" name="id" value={deal.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên combo" name="name" required maxLength={80} defaultValue={values.name ?? deal?.name ?? ""} error={errors.name} hint="Ví dụ: Đủ bộ Combaticon." />
        <Field label="Giảm (%)" name="percent" type="number" min={1} max={50} required defaultValue={values.percent ?? String(deal?.percent ?? 10)} error={errors.percent} hint="Tính trên giá các món trong bộ." />
      </div>
      <fieldset className="space-y-2" aria-describedby={errors.productIds ? "productIds-error" : undefined}>
        <legend className="text-sm font-medium">Sản phẩm trong combo (2–10)</legend>
        <div className="grid max-h-72 gap-1 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2">
          {products.map((product) => (
            <label key={product.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="productIds" value={product.id} defaultChecked={chosen.has(product.id)} className="accent-brand" />
              <span className={product.status === "published" ? "" : "text-muted"}>
                {product.name}
                {product.status !== "published" && " (đang ẩn)"}
              </span>
            </label>
          ))}
        </div>
        {errors.productIds && (
          <p id="productIds-error" role="alert" className="text-xs text-danger">
            {errors.productIds}
          </p>
        )}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={values.isActive !== undefined ? values.isActive === "on" : (deal?.isActive ?? true)} className="accent-brand" />
        Đang bật
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {deal ? "Lưu combo" : "Tạo combo"}
        </Button>
        {deal && (
          <ButtonLink href="/admin/combo" variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
