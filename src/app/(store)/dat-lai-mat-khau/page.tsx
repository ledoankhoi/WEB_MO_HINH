import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/account/PasswordResetForms";

// Liên kết chứa token bí mật: không lập chỉ mục, không gửi Referer ra ngoài.
export const metadata: Metadata = { title: "Đặt lại mật khẩu", robots: { index: false }, referrer: "no-referrer" };

async function Form({ searchParams }: Pick<PageProps<"/dat-lai-mat-khau">, "searchParams">) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  if (!token) {
    return (
      <p className="rounded-xl border border-line bg-surface p-6 text-sm">
        Liên kết thiếu mã. Hãy mở đúng liên kết trong email, hoặc{" "}
        <Link href="/quen-mat-khau" className="font-semibold text-brand-strong underline">
          yêu cầu liên kết mới
        </Link>
        .
      </p>
    );
  }
  return <ResetPasswordForm token={token} />;
}

export default function ResetPasswordPage({ searchParams }: PageProps<"/dat-lai-mat-khau">) {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight">Đặt mật khẩu mới</h1>
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Đang tải...</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
