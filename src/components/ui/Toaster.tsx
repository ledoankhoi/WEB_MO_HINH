"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
  action?: { href: string; label: string };
};

const EMPTY: readonly Toast[] = [];
const DURATION_MS = 3800;

let toasts: readonly Toast[] = EMPTY;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function dismiss(id: number) {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

// Hiện một thông báo nổi ngắn ở góc màn hình. Gọi được từ bất kỳ Client Component nào.
export function showToast(message: string, options: { tone?: Toast["tone"]; action?: Toast["action"] } = {}) {
  const id = nextId++;
  // Chỉ giữ ba thông báo gần nhất để không che nội dung.
  toasts = [...toasts.slice(-2), { id, message, tone: options.tone ?? "success", action: options.action }];
  emit();
  window.setTimeout(() => dismiss(id), DURATION_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function Toaster() {
  const items = useSyncExternalStore(
    subscribe,
    () => toasts,
    () => EMPTY,
  );

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg shadow-black/10"
        >
          {toast.tone === "success" ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          )}
          <p className="min-w-0 flex-1 text-fg">{toast.message}</p>
          {toast.action && (
            <Link href={toast.action.href} className="shrink-0 font-semibold text-brand-strong hover:underline">
              {toast.action.label}
            </Link>
          )}
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 text-muted hover:text-fg"
            aria-label="Đóng thông báo"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
