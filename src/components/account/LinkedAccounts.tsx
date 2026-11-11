"use client";

import { useTransition } from "react";
import { unlinkIdentityAction } from "@/app/actions/oauth";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { showToast } from "@/components/ui/Toaster";
import { formatDate } from "@/lib/format";

type Provider = { key: "google" | "facebook"; label: string; linked: { email: string; createdAt: number } | null };

// Liên kết đăng nhập Google, Facebook (nghiep-vu-ban-hang mục 14). Liên kết đi qua trang của nhà cung cấp rồi quay về đây.
export function LinkedAccounts({ providers, result }: { providers: Provider[]; result: string }) {
  const [pending, startTransition] = useTransition();
  if (providers.length === 0) return null;
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Liên kết đăng nhập</h2>
        <p className="text-sm text-muted">Đăng nhập nhanh bằng tài khoản Google, Facebook đã liên kết.</p>
      </div>
      {result === "ok" && <Notice tone="success">Đã liên kết.</Notice>}
      {result === "trung" && <Notice tone="error">Tài khoản này đã liên kết với một tài khoản ROBOTICA khác, hoặc bạn đã liên kết một tài khoản khác của nhà cung cấp này.</Notice>}
      <ul className="divide-y divide-line text-sm">
        {providers.map((provider) => (
          <li key={provider.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span>
              <strong>{provider.label}</strong>
              {provider.linked && (
                <span className="block text-muted">
                  {provider.linked.email || "Đã liên kết"} · từ {formatDate(provider.linked.createdAt)}
                </span>
              )}
            </span>
            {provider.linked ? (
              <Button
                size="sm"
                variant="secondary"
                pending={pending}
                onClick={() =>
                  startTransition(async () => {
                    const reply = await unlinkIdentityAction(provider.key);
                    if (!reply.ok) showToast(reply.message ?? "Không thực hiện được.", { tone: "error" });
                  })
                }
              >
                Bỏ liên kết
              </Button>
            ) : (
              <a href={`/api/dang-nhap/${provider.key}?lien-ket=1`} className="rounded-full border border-line px-4 py-1.5 font-semibold hover:bg-raised">
                Liên kết
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
