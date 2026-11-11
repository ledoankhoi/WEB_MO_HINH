"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeOrderAction, previewCouponAction, type CheckoutState } from "@/app/actions/orders";
import { sendOrderOtpAction } from "@/app/actions/otp";
import { RadioGroup, RadioGroupItem, radioCardClass } from "@/components/animate/RadioGroup";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { ADDRESS_LABELS, type Address } from "@/lib/account";
import { PAYMENT_METHOD_LABELS, PROVINCES, type PaymentMethod } from "@/lib/catalog";
import { cart, useCart } from "@/lib/cart";
import { formatDate, formatVnd } from "@/lib/format";
import { orderDeposit, type PaymentPlan } from "@/lib/preorder";
import { OrderSummary, PreorderNotice } from "./CartView";
import { WorkshopLines } from "./WorkshopLines";

type Defaults = { name: string; phone: string; email: string; address: string; city: string };

const INITIAL: CheckoutState = {};

// Ô mã OTP cho đơn COD giá trị lớn (nghiep-vu-ban-hang mục 15): gửi mã tới email đang nhập, khách nhập mã rồi đặt hàng.
function CodOtpField({ email, from, error }: { email: string; from: number; error?: string }) {
  const [sent, setSent] = useState<{ ok?: boolean; message?: string } | null>(null);
  const [sending, startSending] = useTransition();
  return (
    <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
      <p className="text-sm">
        Đơn thanh toán khi nhận hàng từ <strong>{formatVnd(from)}</strong> cần xác nhận bằng mã gửi tới email của đơn.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Mã xác nhận" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={error} />
        <Button type="button" variant="secondary" size="sm" pending={sending} onClick={() => startSending(async () => setSent(await sendOrderOtpAction(email)))}>
          Gửi mã
        </Button>
      </div>
      {sent?.message && <p className={`text-xs ${sent.ok ? "text-success" : "text-danger"}`}>{sent.message}</p>}
    </div>
  );
}

// `codOtp`: ngưỡng COD cần mã và email tài khoản đã xác thực (đặt bằng email đó thì không cần mã).
export function CheckoutForm({
  defaults,
  paymentMethods,
  addresses = [],
  codOtp = { from: Number.POSITIVE_INFINITY, verifiedEmail: null },
}: {
  defaults: Defaults;
  paymentMethods: PaymentMethod[];
  addresses?: Address[];
  codOtp?: { from: number; verifiedEmail: string | null };
}) {
  // Địa chỉ đang chọn trong sổ địa chỉ (khách đã đăng nhập). Đổi địa chỉ thì dựng lại các ô người nhận với giá trị mới.
  const [picked, setPicked] = useState(() => addresses.find((item) => item.isDefault)?.id ?? "");
  const pickedAddress = addresses.find((item) => item.id === picked) ?? null;
  const router = useRouter();
  const { rows, loading, failed, totals, deposit, hasPreorder, canCheckout, reload } = useCart();
  const [state, action, pending] = useActionState(placeOrderAction, INITIAL);
  // Hàng đặt trước cần cọc: khách chọn chỉ trả cọc trước hay trả đủ (src/lib/preorder.ts).
  const [plan, setPlan] = useState<PaymentPlan>("deposit");
  // Phương thức và email khách đang chọn, để biết đơn COD giá trị lớn có cần mã OTP không (mục 15).
  const [methodChoice, setMethodChoice] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string | null>(null);
  // Khách yêu cầu hoá đơn VAT (mục 17); null là chưa bấm, theo giá trị máy chủ trả về.
  const [vatChoice, setVatChoice] = useState<boolean | null>(null);
  // Một mã cho mỗi lần mở trang thanh toán: bấm đặt hàng nhiều lần chỉ tạo một đơn (YC-GH-07).
  const [idempotencyKey] = useState(() => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));

  // Đặt hàng xong: xoá giỏ rồi chuyển tới trang đơn hàng.
  // Thanh toán online: chuyển cả trang tới cổng (VNPay), cổng đưa khách về trang đơn sau khi trả.
  useEffect(() => {
    if (!state.token) return;
    cart.clear();
    if (state.payUrl) window.location.assign(state.payUrl);
    else router.replace(`/don-hang/${state.token}`);
  }, [state.token, state.payUrl, router]);

  // Mã giảm giá đang áp (máy chủ đã xem trước); lúc đặt hàng máy chủ kiểm tra lại.
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [checking, startChecking] = useTransition();
  // Máy chủ vừa từ chối mã lúc đặt hàng: bỏ mã đang áp (điều chỉnh state ngay khi render).
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.couponRejected) setCoupon(null);
  }

  // Máy chủ báo giỏ hàng đã thay đổi: tải lại giá và tồn kho.
  useEffect(() => {
    if (state.issues?.length) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi có kết quả mới từ máy chủ
  }, [state]);

  if (state.token) {
    return <p className="py-20 text-center text-sm text-muted">{state.payUrl ? "Đang chuyển tới cổng thanh toán VNPay..." : "Đang chuyển tới đơn hàng của bạn..."}</p>;
  }
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

  // "Nhập địa chỉ khác": để trống địa chỉ, giữ họ tên, số điện thoại của tài khoản.
  const fromAddress: Partial<Defaults> = pickedAddress
    ? { name: pickedAddress.recipientName, phone: pickedAddress.phone, address: pickedAddress.address, city: pickedAddress.city }
    : addresses.length > 0
      ? { address: "", city: "" }
      : {};
  const value = (name: keyof Defaults | "note") =>
    state.values?.[name] ?? (name === "note" ? "" : (fromAddress[name] ?? defaults[name]));
  // pre: dòng khách đang thấy là hàng đặt trước; máy chủ so lại, khác thì báo giỏ đã đổi.
  const items = rows.map((row) => ({ id: row.id, qty: row.qty, price: row.unitPrice, pre: row.product?.preorder ? 1 : 0, ...(row.cfg ? { cfg: row.cfg } : {}) }));
  // Giảm combo (đã có trong totals.discount) cộng mã giảm giá, không vượt tạm tính.
  const discount = Math.min((coupon?.discount ?? 0) + totals.discount, totals.subtotal);
  const total = totals.subtotal - discount + totals.shipping;
  // Cọc thực thu theo lựa chọn; cọc từ tổng đơn trở lên thì phải trả đủ. Trả đủ trước thì không nhận COD.
  // Cọc không nhỏ hơn tổng đơn thì chỉ còn cách trả đủ.
  const effectivePlan: PaymentPlan = deposit >= total ? "full" : plan;
  const depositAmount = orderDeposit(deposit, total, effectivePlan);
  const prepaid = paymentMethods.filter((method) => method !== "cod");
  const mustPrepay = deposit > 0 && depositAmount === 0;
  const methods = mustPrepay ? prepaid : paymentMethods;
  const selectedMethod = methods.find((method) => method === state.values?.paymentMethod) ?? methods[0];
  const currentMethod = methods.find((method) => method === methodChoice) ?? selectedMethod;
  const currentEmail = (emailInput ?? value("email")).trim().toLowerCase();
  // Phần trả khi nhận hàng từ ngưỡng, trừ khi email đơn là email tài khoản đã xác thực.
  const needOtp =
    currentMethod === "cod" && (state.otpRequired || (total - depositAmount >= codOtp.from && !(codOtp.verifiedEmail && currentEmail === codOtp.verifiedEmail)));
  const latest = Math.max(0, ...rows.flatMap((row) => (row.product?.preorder ? [row.product.preorder.expectedAt] : [])));
  const applyCoupon = () =>
    startChecking(async () => {
      const result = await previewCouponAction(couponInput, JSON.stringify(items));
      setCouponError(result.ok ? "" : result.message);
      setCoupon(result.ok ? { code: result.code, discount: result.discount } : null);
    });

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {coupon && <input type="hidden" name="couponCode" value={coupon.code} />}
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
        {addresses.length > 0 && (
          <label className="block space-y-1.5 text-sm font-medium">
            Địa chỉ đã lưu
            <select
              value={picked}
              onChange={(event) => setPicked(event.target.value)}
              className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm font-normal focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
            >
              {addresses.map((item) => (
                <option key={item.id} value={item.id}>
                  {ADDRESS_LABELS[item.label]}: {item.recipientName}, {item.address}, {item.city}
                  {item.isDefault ? " (mặc định)" : ""}
                </option>
              ))}
              <option value="">Nhập địa chỉ khác</option>
            </select>
          </label>
        )}
        {/* key: chọn địa chỉ khác trong sổ thì dựng lại các ô với giá trị của địa chỉ đó. */}
        <div key={picked} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Họ và tên" name="name" required autoComplete="name" defaultValue={value("name")} error={state.errors?.name} />
            <Field label="Số điện thoại" name="phone" type="tel" required autoComplete="tel" defaultValue={value("phone")} error={state.errors?.phone} />
          </div>
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={value("email")}
            onChange={(event) => setEmailInput(event.target.value)}
            error={state.errors?.email}
            hint={needOtp ? "Cần để nhận mã xác nhận đơn." : "Không bắt buộc."}
          />
          <Field label="Địa chỉ" name="address" required autoComplete="street-address" placeholder="Số nhà, đường, phường/xã" defaultValue={value("address")} error={state.errors?.address} />
          <SelectField label="Tỉnh / Thành phố" name="city" required defaultValue={value("city")} error={state.errors?.city}>
            <option value="">Chọn tỉnh, thành phố</option>
            {PROVINCES.map((province) => (
              <option key={province}>{province}</option>
            ))}
          </SelectField>
        </div>
        <TextAreaField label="Ghi chú" name="note" maxLength={500} defaultValue={value("note")} error={state.errors?.note} />

        <div className="space-y-4 rounded-xl border border-line p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="vatInvoice"
              checked={vatChoice ?? state.values?.vatInvoice === "on"}
              onChange={(event) => setVatChoice(event.target.checked)}
              className="accent-brand"
            />
            Xuất hoá đơn VAT cho công ty
          </label>
          {(vatChoice ?? state.values?.vatInvoice === "on") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tên công ty" name="companyName" required maxLength={200} defaultValue={state.values?.companyName} error={state.errors?.companyName} />
              <Field label="Mã số thuế" name="taxCode" required inputMode="numeric" maxLength={14} defaultValue={state.values?.taxCode} error={state.errors?.taxCode} hint="10 số, chi nhánh thêm -xxx." />
              <Field label="Địa chỉ công ty" name="companyAddress" required maxLength={300} defaultValue={state.values?.companyAddress} error={state.errors?.companyAddress} />
              <Field label="Email nhận hoá đơn" name="invoiceEmail" type="email" required defaultValue={state.values?.invoiceEmail} error={state.errors?.invoiceEmail} />
            </div>
          )}
        </div>

        {deposit > 0 && (
          <div className="space-y-2">
            <p id="paymentPlan-label" className="mb-1 text-sm font-medium">
              Thanh toán hàng đặt trước
            </p>
            <input type="hidden" name="paymentPlan" value={effectivePlan} />
            <RadioGroup value={effectivePlan} onValueChange={(value) => setPlan(value === "full" ? "full" : "deposit")} aria-labelledby="paymentPlan-label">
              {deposit < total && (
                <label className={radioCardClass}>
                  <RadioGroupItem value="deposit" />
                  <span className="flex-1">
                    Đặt cọc <strong className="tabular-nums">{formatVnd(deposit)}</strong>, phần còn lại{" "}
                    <span className="tabular-nums">{formatVnd(total - deposit)}</span> trả khi nhận hàng
                  </span>
                </label>
              )}
              {prepaid.length > 0 && (
                <label className={radioCardClass}>
                  <RadioGroupItem value="full" />
                  <span className="flex-1">
                    Trả đủ ngay <strong className="tabular-nums">{formatVnd(total)}</strong>
                  </span>
                </label>
              )}
            </RadioGroup>
            {mustPrepay && prepaid.length === 0 && (
              <Notice tone="error">Đơn này cần trả trước toàn bộ nhưng cửa hàng chưa bật chuyển khoản hay VNPay. Vui lòng liên hệ cửa hàng.</Notice>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p id="paymentMethod-label" className="mb-1 text-sm font-medium">
            Phương thức thanh toán
          </p>
          {depositAmount > 0 && (
            <p className="text-xs text-muted">
              Tiền cọc trả bằng chuyển khoản (hoặc VNPay nếu chọn VNPay); phương thức dưới đây dùng cho phần còn lại.
            </p>
          )}
          {/* RadioGroup của Animate UI; `name` giúp giá trị vẫn nằm trong FormData gửi đi. */}
          {/* key: đổi giữa đặt cọc và trả đủ thì danh sách phương thức đổi, dựng lại để chọn lại mặc định. */}
          <RadioGroup
            key={mustPrepay ? "prepaid" : "all"}
            name="paymentMethod"
            defaultValue={selectedMethod}
            onValueChange={setMethodChoice}
            aria-labelledby="paymentMethod-label"
            aria-describedby={state.errors?.paymentMethod ? "paymentMethod-error" : undefined}
          >
            {methods.map((method) => (
              <label key={method} className={radioCardClass}>
                <RadioGroupItem value={method} />
                {PAYMENT_METHOD_LABELS[method]}
              </label>
            ))}
          </RadioGroup>
          {state.errors?.paymentMethod && (
            <p id="paymentMethod-error" role="alert" className="text-xs text-danger">
              {state.errors.paymentMethod}
            </p>
          )}
        </div>
        {needOtp && <CodOtpField email={currentEmail} from={codOtp.from} error={state.errors?.otp} />}
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Đơn hàng</h2>
        <ul className="space-y-2 text-sm">
          {rows.map((row) => (
            <li key={row.key} className="space-y-1">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 truncate">
                  {row.product!.name} <span className="text-muted">× {row.qty}</span>
                </span>
                <span className="shrink-0 tabular-nums">{formatVnd(row.lineTotal)}</span>
              </div>
              {row.config && row.config.lines.length > 0 && <WorkshopLines config={row.config} compact />}
              {row.product?.preorder && <p className="text-xs font-semibold text-cobalt">Đặt trước · dự kiến về {formatDate(row.product.preorder.expectedAt)}</p>}
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-line pt-4">
          {coupon ? (
            <p className="flex items-center justify-between gap-2 text-sm">
              <span>
                Đã áp mã <strong>{coupon.code}</strong>
              </span>
              <button type="button" onClick={() => setCoupon(null)} className="font-medium text-brand-strong hover:underline">
                Bỏ mã
              </button>
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <Field
                label="Mã giảm giá"
                name="couponInput"
                value={couponInput}
                maxLength={30}
                autoComplete="off"
                onChange={(event) => setCouponInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter trong ô này áp mã, không gửi đơn.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (couponInput.trim()) applyCoupon();
                  }
                }}
                error={couponError}
              />
              <Button type="button" variant="secondary" size="sm" pending={checking} disabled={!couponInput.trim()} onClick={applyCoupon}>
                Áp dụng
              </Button>
            </div>
          )}
        </div>
        <div className="border-t border-line pt-4">
          <OrderSummary totals={{ ...totals, discount, total }} couponCode={coupon?.code} bundleDiscount={totals.discount} />
          {depositAmount > 0 && (
            <dl className="mt-3 space-y-1 border-t border-dashed border-line pt-3 text-sm">
              <div className="flex justify-between font-semibold">
                <dt>Trả trước (tiền cọc)</dt>
                <dd className="tabular-nums">{formatVnd(depositAmount)}</dd>
              </div>
              <div className="flex justify-between text-muted">
                <dt>Còn lại khi nhận hàng</dt>
                <dd className="tabular-nums">{formatVnd(total - depositAmount)}</dd>
              </div>
            </dl>
          )}
        </div>
        {hasPreorder && (
          <>
            <PreorderNotice deposit={0} />
            {latest > 0 && <p className="text-xs text-muted">Dự kiến giao sau ngày {formatDate(latest)} (ngày hàng về muộn nhất trong đơn).</p>}
          </>
        )}
        <Button type="submit" size="lg" full pending={pending} disabled={methods.length === 0}>
          {hasPreorder ? "Đặt hàng (có đặt trước)" : "Đặt hàng"}
        </Button>
      </aside>
    </form>
  );
}
