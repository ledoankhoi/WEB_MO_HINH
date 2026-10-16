"use client";

import { useActionState } from "react";
import { submitReviewAction } from "@/app/actions/reviews";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const INITIAL: FormState = {};

// Một dòng đơn chờ đánh giá. Gửi xong trang làm mới và dòng này biến mất khỏi danh sách.
export function ReviewForm({ orderItemId, title }: { orderItemId: number; title: string }) {
  const [state, action, pending] = useActionState(submitReviewAction, INITIAL);
  const id = `danh-gia-${orderItemId}`;
  return (
    <form action={action} className="space-y-3 p-4" aria-labelledby={id}>
      <p id={id} className="text-sm font-medium">
        {title}
      </p>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <input type="hidden" name="orderItemId" value={orderItemId} />
      <fieldset>
        <legend className="mb-1 text-sm">Số sao</legend>
        <div className="flex flex-wrap gap-3">
          {[5, 4, 3, 2, 1].map((star) => (
            <label key={star} className="flex items-center gap-1 text-sm">
              <input type="radio" name="rating" value={star} required defaultChecked={state.values?.rating === String(star)} className="accent-brand" />
              {star} <span aria-hidden="true" className="text-warning">★</span>
            </label>
          ))}
        </div>
        {state.errors?.rating && <p className="mt-1 text-xs text-danger">{state.errors.rating}</p>}
      </fieldset>
      <TextAreaField label="Nhận xét (không bắt buộc)" name={`comment-${orderItemId}`} rows={2} maxLength={1000} defaultValue={state.values?.comment} error={state.errors?.comment} />
      <Button type="submit" size="sm" pending={pending}>
        Gửi đánh giá
      </Button>
    </form>
  );
}
