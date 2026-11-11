"use client";

import { useActionState, useTransition } from "react";
import { removeFlashItemAction, saveFlashItemAction, saveFlashSaleAction } from "@/app/actions/flash-sales";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { showToast } from "@/components/ui/Toaster";
import { toVnDateTimeInput } from "@/lib/format";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

type SaleValues = { id: string; title: string; startsAt: number; endsAt: number; isActive: boolean };

// Tạo hoặc sửa chương trình: tên, khung giờ theo giờ Việt Nam, bật/tắt.
export function FlashSaleForm({ sale }: { sale?: SaleValues }) {
  const [state, action, pending] = useActionState(saveFlashSaleAction, INITIAL);
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{sale ? "Sửa chương trình" : "Tạo chương trình flash sale"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {sale && <input type="hidden" name="id" value={sale.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tên chương trình" name="title" required maxLength={60} defaultValue={value("title", sale?.title ?? "Flash sale")} error={errors.title} hint="Hiện trên nhãn giá, ví dụ: Giờ vàng 12h." />
        <Field label="Bắt đầu (giờ Việt Nam)" name="startsAt" type="datetime-local" required defaultValue={value("startsAt", sale ? toVnDateTimeInput(sale.startsAt) : "")} error={errors.startsAt} />
        <Field label="Kết thúc (giờ Việt Nam)" name="endsAt" type="datetime-local" required defaultValue={value("endsAt", sale ? toVnDateTimeInput(sale.endsAt) : "")} error={errors.endsAt} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={values.isActive !== undefined ? values.isActive === "on" : (sale?.isActive ?? true)} className="accent-brand" />
        Đang bật (tắt thì giá sale không còn áp dụng, đơn đã đặt giữ nguyên giá)
      </label>
      <Button type="submit" pending={pending}>
        {sale ? "Lưu chương trình" : "Tạo chương trình"}
      </Button>
    </form>
  );
}

// Thêm hoặc sửa một phiên bản trong chương trình (cùng phiên bản thì ghi đè giá, suất).
export function FlashItemForm({ saleId, variants }: { saleId: string; variants: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(saveFlashItemAction, INITIAL);
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Thêm phiên bản vào chương trình</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <input type="hidden" name="saleId" value={saleId} />
      <SelectField label="Phiên bản" name="variantId" required defaultValue={state.ok ? "" : (values.variantId ?? "")} error={errors.variantId} hint="Chọn lại phiên bản đã có để sửa giá, số suất.">
        <option value="">Chọn phiên bản</option>
        {variants.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Giá sale (đồng)" name="salePrice" type="number" min={1} required defaultValue={state.ok ? "" : values.salePrice} error={errors.salePrice} />
        <Field label="Tổng số suất" name="qtyLimit" type="number" min={1} required defaultValue={state.ok ? "" : values.qtyLimit} error={errors.qtyLimit} hint="Hết suất thì về giá thường." />
        <Field label="Tối đa mỗi đơn" name="maxPerOrder" type="number" min={1} defaultValue={state.ok ? "" : values.maxPerOrder} error={errors.maxPerOrder} hint="Bỏ trống là không giới hạn riêng." />
      </div>
      <Button type="submit" pending={pending}>
        Lưu phiên bản
      </Button>
    </form>
  );
}

export function RemoveFlashItemButton({ saleId, variantId }: { saleId: string; variantId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      pending={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeFlashItemAction(saleId, variantId);
          if (!result.ok) showToast(result.message ?? "Không thực hiện được.", { tone: "error" });
        })
      }
    >
      Bỏ
    </Button>
  );
}
