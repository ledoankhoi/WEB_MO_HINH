"use client";

import { useActionState } from "react";
import { saveCouponAction } from "@/app/actions/coupons";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { toVnDateTimeInput } from "@/lib/format";
import type { FormState } from "@/lib/types";
import type { Coupon } from "@/server/repo/coupons";

const INITIAL: FormState = {};
const text = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

export function CouponForm({ coupon, categories }: { coupon?: Coupon; categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveCouponAction, INITIAL);
  const values = state.ok && !coupon ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok && !coupon ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{coupon ? `Sửa mã ${coupon.code}` : "Tạo mã giảm giá"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {coupon && <input type="hidden" name="id" value={coupon.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã" name="code" required maxLength={30} defaultValue={value("code", coupon?.code ?? "")} error={errors.code} hint="Khách nhập không phân biệt hoa thường." />
        <SelectField label="Loại giảm" name="kind" defaultValue={value("kind", coupon?.kind ?? "fixed")} error={errors.kind}>
          <option value="fixed">Số tiền cố định</option>
          <option value="percent">Phần trăm</option>
        </SelectField>
        <Field label="Mức giảm (đồng hoặc %)" name="value" type="number" min={1} required defaultValue={value("value", text(coupon?.value))} error={errors.value} />
        <Field label="Giảm tối đa (đồng)" name="maxDiscount" type="number" min={1} defaultValue={value("maxDiscount", text(coupon?.maxDiscount))} error={errors.maxDiscount} hint="Chỉ dùng cho loại phần trăm. Để trống là không giới hạn." />
        <Field label="Đơn tối thiểu (đồng)" name="minSubtotal" type="number" min={0} defaultValue={value("minSubtotal", text(coupon?.minSubtotal ?? 0))} error={errors.minSubtotal} />
        <SelectField label="Chỉ áp cho danh mục" name="categoryId" defaultValue={value("categoryId", coupon?.categoryId ?? "")} error={errors.categoryId}>
          <option value="">Mọi sản phẩm</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <Field label="Bắt đầu (giờ Việt Nam)" name="startsAt" type="datetime-local" defaultValue={value("startsAt", coupon?.startsAt ? toVnDateTimeInput(coupon.startsAt) : "")} error={errors.startsAt} hint="Để trống là dùng được ngay." />
        <Field label="Kết thúc (giờ Việt Nam)" name="endsAt" type="datetime-local" defaultValue={value("endsAt", coupon?.endsAt ? toVnDateTimeInput(coupon.endsAt) : "")} error={errors.endsAt} hint="Để trống là không hết hạn." />
        <Field label="Tổng số lượt" name="usageLimit" type="number" min={1} defaultValue={value("usageLimit", text(coupon?.usageLimit))} error={errors.usageLimit} hint="Để trống là không giới hạn. Đơn bị huỷ được trả lượt." />
        <label className="flex items-center gap-2 self-end pb-3 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive !== undefined ? values.isActive === "on" : (coupon?.isActive ?? true)} className="accent-brand" />
          Đang bật
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {coupon ? "Lưu mã" : "Tạo mã"}
        </Button>
        {coupon && (
          <ButtonLink href="/admin/ma-giam-gia" variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
