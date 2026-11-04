"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, CircleAlert } from "lucide-react";
import { AnimateIcon, Check, X } from "@/components/animate/icons";

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
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
export function showToast(message: string, options: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number } = {}) {
  const id = nextId++;
  // Chỉ giữ ba thông báo gần nhất để không che nội dung.
  toasts = [...toasts.slice(-2), { id, message, tone: options.tone ?? "success", action: options.action }];
  emit();
  window.setTimeout(() => dismiss(id), options.duration ?? DURATION_MS);
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
      <AnimatePresence initial={false}>
        {items.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm shadow-lg shadow-black/10"
          >
            {toast.tone === "success" ? (
              // Dấu tích được vẽ ra khi thông báo hiện lên.
              <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-success text-white">
                <Check animate animation="path" className="size-3" strokeWidth={3} aria-hidden />
              </span>
            ) : toast.tone === "info" ? (
              <BellRing className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
            ) : (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            )}
            <p className="min-w-0 flex-1 text-fg">{toast.message}</p>
            {toast.action && (
              <Link href={toast.action.href} className="shrink-0 font-semibold text-brand-strong hover:underline">
                {toast.action.label}
              </Link>
            )}
            <AnimateIcon animateOnHover asChild>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-muted hover:text-fg"
                aria-label="Đóng thông báo"
              >
                <X className="size-4" aria-hidden />
              </button>
            </AnimateIcon>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
