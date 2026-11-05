"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { BellRing, Check } from "lucide-react";
import { requestStockAlertAction } from "@/app/actions/stock-alerts";
import { showToast } from "@/components/ui/Toaster";

// "Báo khi có hàng" cho phiên bản đang hết. Đã đăng nhập: bấm là xong (dùng email tài khoản). Chưa đăng nhập: hiện ô
// nhập email hoặc số điện thoại ngay tại chỗ.
export function StockAlertButton({ variantId, name }: { variantId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (asking) input.current?.focus();
  }, [asking]);

  const send = (contact: string) =>
    startTransition(async () => {
      const result = await requestStockAlertAction(variantId, contact);
      if (result.needContact) {
        setAsking(true);
        setError(contact ? result.message : "");
        return;
      }
      if (!result.ok) {
        showToast(result.message, { tone: "error" });
        return;
      }
      setAsking(false);
      setDone(true);
      showToast(result.message);
    });

  if (done) {
    return (
      <p role="status" className="inline-flex h-12 w-full items-center justify-center gap-2 border-3 border-ink bg-raised font-condensed text-[17px] font-extrabold uppercase">
        <Check className="size-5" aria-hidden />
        Đã đăng ký báo hàng
      </p>
    );
  }

  if (asking) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send(String(new FormData(event.currentTarget).get("contact") ?? ""));
        }}
        className="space-y-1.5"
      >
        <label htmlFor={inputId} className="block text-sm font-semibold">
          Email hoặc số điện thoại để nhận tin
        </label>
        <div className="flex">
          <input
            ref={input}
            id={inputId}
            name="contact"
            type="text"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={254}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="h-12 min-w-0 flex-1 border-3 border-r-0 border-ink bg-surface px-3 text-base text-fg"
          />
          <button
            type="submit"
            disabled={pending}
            aria-label={`Gửi đăng ký báo hàng cho ${name}`}
            className="h-12 shrink-0 bg-ink px-4 font-condensed text-lg font-extrabold text-white uppercase transition hover:bg-brand disabled:opacity-60"
          >
            Gửi
          </button>
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm font-medium text-brand-strong">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => send("")}
      aria-label={`Báo cho tôi khi ${name} có hàng`}
      className="inline-flex h-12 w-full items-center justify-center gap-2 border-3 border-ink bg-surface font-condensed text-[19px] font-extrabold uppercase transition hover:bg-raised disabled:opacity-60"
    >
      <BellRing className="size-5" aria-hidden />
      Báo khi có hàng
    </button>
  );
}
