"use client";

import { useActionState, useTransition } from "react";
import { allocateOfferAction, createOfferAction, endOfferAction, setOfferAcceptingAction, updateOfferAction } from "@/app/actions/preorders";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { showToast } from "@/components/ui/Toaster";
import { toVnDateTimeInput } from "@/lib/format";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};
// Ô <input type="date"> theo ngày Việt Nam.
const dateInput = (ms: number) => toVnDateTimeInput(ms).slice(0, 10);

type OfferValues = { id: string; expectedAt: number; depositPercent: number; maxQty: number | null; note: string };

// Tạo đợt (chọn phiên bản) hoặc sửa đợt (ngày về, % cọc, số suất, ghi chú hiện cho khách).
export function OfferForm({ offer, variants, defaultVariant = "" }: { offer?: OfferValues; variants?: { id: string; label: string }[]; defaultVariant?: string }) {
  const [state, action, pending] = useActionState(offer ? updateOfferAction : createOfferAction, INITIAL);
  const values = state.values ?? {};
  const errors = state.errors ?? {};
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{offer ? "Sửa đợt đặt trước" : "Mở đợt đặt trước"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {offer && <input type="hidden" name="id" value={offer.id} />}
      {!offer && variants && (
        <SelectField label="Phiên bản" name="variantId" required defaultValue={value("variantId", defaultVariant)} error={errors.variantId} hint="Khi đợt chưa kết thúc, phiên bản chỉ bán dạng đặt trước, không bán thường.">
          <option value="">Chọn phiên bản</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.label}
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Ngày dự kiến về"
          name="expectedAt"
          type="date"
          required
          defaultValue={value("expectedAt", offer ? dateInput(offer.expectedAt) : "")}
          error={errors.expectedAt}
          hint={offer ? "Đổi ngày thì khách đang chờ nhận thư báo." : undefined}
        />
        <Field
          label="Cọc (%)"
          name="depositPercent"
          type="number"
          min={0}
          max={100}
          required
          defaultValue={value("depositPercent", String(offer?.depositPercent ?? 30))}
          error={errors.depositPercent}
          hint="0: không cần cọc; 100: trả đủ khi đặt. Đổi chỉ áp cho đơn đặt sau."
        />
        <Field
          label="Số suất"
          name="maxQty"
          type="number"
          min={1}
          defaultValue={value("maxQty", offer?.maxQty ? String(offer.maxQty) : "")}
          error={errors.maxQty}
          hint="Bỏ trống là không giới hạn."
        />
      </div>
      <TextAreaField
        label="Ghi chú cho khách"
        name="note"
        maxLength={300}
        rows={2}
        defaultValue={value("note", offer?.note ?? "")}
        error={errors.note}
        hint="Hiện ở trang sản phẩm, ví dụ: hàng Nhật nội địa, có thể trễ 2–4 tuần."
      />
      <Button type="submit" pending={pending}>
        {offer ? "Lưu" : "Mở đặt trước"}
      </Button>
    </form>
  );
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<FormState>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      const result = await task();
      if (result.message) showToast(result.message, { tone: result.ok ? "success" : "error" });
      else if (!result.ok) showToast("Không thực hiện được.", { tone: "error" });
    });
  };
  return [pending, run] as const;
}

// Phân bổ hàng đã về (quyền orders.fulfil).
export function AllocateButton({ id, disabled, label = "Phân bổ hàng đã về" }: { id: string; disabled?: boolean; label?: string }) {
  const [pending, run] = useRun();
  return (
    <Button size="sm" pending={pending} disabled={disabled} onClick={() => run(() => allocateOfferAction(id), "Giữ hàng cho các đơn đặt trước theo thứ tự đặt và gửi thư báo khách?")}>
      {label}
    </Button>
  );
}

// Ngừng / mở lại nhận đặt, kết thúc đợt (quyền catalog.edit).
export function OfferStatusButtons({ id, status }: { id: string; status: "open" | "closed" }) {
  const [pending, run] = useRun();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" pending={pending} onClick={() => run(() => setOfferAcceptingAction(id, status === "closed"))}>
        {status === "open" ? "Ngừng nhận đặt" : "Mở lại nhận đặt"}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        pending={pending}
        onClick={() => run(() => endOfferAction(id), "Kết thúc đợt: phiên bản bán lại như thường theo tồn kho. Tiếp tục?")}
      >
        Kết thúc đợt
      </Button>
    </div>
  );
}
