"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { saveVariantAction, variantAction } from "@/app/actions/admin";
import { BADGE, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { formatVnd } from "@/lib/format";
import type { FormState, ProductVariant } from "@/lib/types";

const INITIAL: FormState = {};

function VariantButtons({ productId, variant }: { productId: string; variant: ProductVariant }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (action: "activate" | "deactivate" | "default") => startTransition(async () => setResult(await variantAction(productId, variant.id, action)));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {!variant.isDefault && variant.isActive && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("default")}>
            Đặt mặc định
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(variant.isActive ? "deactivate" : "activate")}>
          {variant.isActive ? "Tắt" : "Bật"}
        </Button>
      </div>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}

function VariantForm({ productId, variant, basePath }: { productId: string; variant?: ProductVariant; basePath: string }) {
  const [state, action, pending] = useActionState(saveVariantAction.bind(null, productId), INITIAL);
  const values = state.ok && !variant ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok && !variant ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{variant ? `Sửa biến thể ${variant.sku}` : "Thêm biến thể"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {variant && <input type="hidden" name="id" value={variant.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="SKU"
          name="sku"
          required
          maxLength={40}
          readOnly={variant?.locked}
          defaultValue={value("sku", variant?.sku ?? "")}
          error={errors.sku}
          hint={variant?.locked ? "Đã có sổ kho hoặc đơn hàng: không đổi được." : undefined}
        />
        <Field label="Mã vạch" name="barcode" maxLength={40} defaultValue={value("barcode", variant?.barcode ?? "")} error={errors.barcode} />
        <Field label="Tên phiên bản" name="name" required maxLength={80} placeholder="Bản thường, bản mạ vàng..." defaultValue={value("name", variant?.name ?? "")} error={errors.name} />
        <SelectField label="Tình trạng" name="condition" defaultValue={value("condition", variant?.condition ?? "new")}>
          <option value="new">Mới</option>
          <option value="used">Đã qua sử dụng</option>
        </SelectField>
        <div className="sm:col-span-2">
          <Field label="Ghi chú tình trạng" name="conditionNote" maxLength={200} defaultValue={value("conditionNote", variant?.conditionNote ?? "")} error={errors.conditionNote} />
        </div>
        <Field label="Giá bán (₫)" name="price" required inputMode="numeric" defaultValue={value("price", variant ? String(variant.price) : "")} error={errors.price} />
        <Field label="Giá gốc (₫)" name="compareAtPrice" inputMode="numeric" defaultValue={value("compareAtPrice", variant?.compareAtPrice?.toString() ?? "")} error={errors.compareAtPrice} />
        <div className="grid grid-cols-3 gap-2">
          {(["colorPrimary", "colorSecondary", "colorAccent"] as const).map((name, index) => (
            <Field
              key={name}
              label={["Màu chính", "Màu phụ", "Màu nhấn"][index]}
              name={name}
              type="color"
              defaultValue={value(name, variant ? [variant.colors.primary, variant.colors.secondary, variant.colors.accent][index] : ["#d9dde3", "#2b2f36", "#00a6c7"][index])}
            />
          ))}
        </div>
      </div>
      {errors.colors && (
        <p role="alert" className="text-xs text-danger">
          {errors.colors}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {variant ? "Lưu biến thể" : "Thêm biến thể"}
        </Button>
        {variant && (
          <ButtonLink href={basePath} variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function VariantsPanel({ productId, variants, editingId, canEdit }: { productId: string; variants: ProductVariant[]; editingId: string; canEdit: boolean }) {
  const basePath = `/admin/san-pham/${productId}?tab=bien-the`;
  const editing = variants.find((variant) => variant.id === editingId);
  return (
    <div className="space-y-6">
      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col">SKU</th>
              <th scope="col">Phiên bản</th>
              <th scope="col" className="text-right">Giá bán</th>
              <th scope="col" className="text-right">Có thể bán</th>
              <th scope="col">Trạng thái</th>
              {canEdit && <th scope="col">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.id} className={variant.isActive ? "" : "text-muted"}>
                <td className="font-mono whitespace-nowrap">
                  {variant.sku}
                  {variant.barcode && <span className="block text-xs text-muted">{variant.barcode}</span>}
                </td>
                <td>
                  {variant.name}
                  {variant.condition === "used" && <span className={`${BADGE} ml-1.5`}>Đã qua sử dụng</span>}
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(variant.price)}</td>
                <td className="text-right tabular-nums">{variant.stock}</td>
                <td className="space-x-1.5 whitespace-nowrap">
                  {variant.isDefault && <span className={BADGE}>Mặc định</span>}
                  <span className={BADGE}>{variant.isActive ? "Đang bật" : "Đã tắt"}</span>
                </td>
                {canEdit && (
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`${basePath}&bien-the=${variant.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                        Sửa
                      </Link>
                      <VariantButtons productId={productId} variant={variant} />
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <VariantForm key={editing?.id ?? "new"} productId={productId} variant={editing} basePath={basePath} />}
    </div>
  );
}
