"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { placeOrderAction, type CheckoutState } from "@/app/actions/orders";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PAYMENT_METHOD_LABELS, PROVINCES, type PaymentMethod } from "@/lib/catalog";
import { cart, useCart } from "@/lib/cart";
import { formatVnd } from "@/lib/format";
import { OrderSummary } from "./CartView";

type Defaults = { name: string; phone: string; email: string; address: string; city: string };

const INITIAL: CheckoutState = {};

export function CheckoutForm({ defaults, paymentMethods }: { defaults: Defaults; paymentMethods: PaymentMethod[] }) {
  const router = useRouter();
  const { rows, loading, failed, totals, canCheckout, reload } = useCart();
  const [state, action, pending] = useActionState(placeOrderAction, INITIAL);

  // Đặt hàng xong: xoá giỏ rồi chuyển tới trang đơn hàng.
  useEffect(() => {
    if (!state.token) return;
    cart.clear();
    router.replace(`/don-hang/${state.token}`);
  }, [state.token, router]);

  // Máy chủ báo giỏ hàng đã thay đổi: tải lại giá và tồn kho.
  useEffect(() => {
    if (state.issues?.length) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có kết quả mới từ máy chủ
  }, [state]);

  if (state.token) return <p className="py-20 text-center text-sm text-muted">Đang chuyển tới đơn hàng của bạn...</p>;
  if (loading) return <p className="py-20 text-center text-sm text-muted">Đang tải giỏ hàng...</p>;

  if (failed || !canCheckout) {
    return (
      <div className="space-y-4">
        <Notice tone={rows.length === 0 ? "info" : "error"}>
          {rows.length === 0
            ? "Giỏ hàng đang trống."
            : "Giỏ hàng có sản phẩm cần xử lý trước khi đặt hàng."}
        </Notice>
        <ButtonLink href={rows.length === 0 ? "/san-pham" : "/gio-hang"} variant="secondary">
          {rows.length === 0 ? "Tiếp tục mua sắm" : "Về giỏ hàng"}
        </ButtonLink>
      </div>
    );
  }

  const value = (name: keyof Defaults | "note") => state.values?.[name] ?? (name === "note" ? "" : defaults[name]);
  const items = rows.map((row) => ({ id: row.id, qty: row.qty, price: row.product!.price }));
  const selectedMethod = state.values?.paymentMethod ?? paymentMethods[0];

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <div className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Thông tin nhận hàng</h2>
        {state.message && (
          <Notice tone="error">
            <p>{state.message}</p>
            {state.issues && state.issues.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {state.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Họ và tên" name="name" required autoComplete="name" defaultValue={value("name")} error={state.errors?.name} />
          <Field label="Số điện thoại" name="phone" type="tel" required autoComplete="tel" defaultValue={value("phone")} error={state.errors?.phone} />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={value("email")} error={state.errors?.email} hint="Không bắt buộc." />
        <Field label="Địa chỉ" name="address" required autoComplete="street-address" placeholder="Số nhà, đường, phường/xã" defaultValue={value("address")} error={state.errors?.address} />
        <SelectField label="Tỉnh / Thành phố" name="city" required defaultValue={value("city")} error={state.errors?.city}>
          <option value="">Chọn tỉnh, thành phố</option>
          {PROVINCES.map((province) => (
            <option key={province}>{province}</option>
          ))}
        </SelectField>
        <TextAreaField label="Ghi chú" name="note" maxLength={500} defaultValue={value("note")} error={state.errors?.note} />

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Phương thức thanh toán</legend>
          {paymentMethods.map((method) => (
            <label key={method} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm has-checked:border-brand has-checked:bg-brand/5">
              <input type="radio" name="paymentMethod" value={method} defaultChecked={method === selectedMethod} className="accent-brand" />
              {PAYMENT_METHOD_LABELS[method]}
            </label>
          ))}
          {state.errors?.paymentMethod && <p className="text-xs text-danger">{state.errors.paymentMethod}</p>}
        </fieldset>
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Đơn hàng</h2>
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {row.product!.name} <span className="text-muted">× {row.qty}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatVnd(row.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-4">
          <OrderSummary totals={totals} />
        </div>
        <Button type="submit" size="lg" full pending={pending}>
          Đặt hàng
        </Button>
      </aside>
    </form>
  );
}
