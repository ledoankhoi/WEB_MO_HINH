import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailForm } from "@/components/account/VerifyEmailForm";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { safeRedirectPath } from "@/lib/validation";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Xác thực email", robots: { index: false } };

async function Verify({ searchParams }: { searchParams: PageProps<"/xac-thuc-email">["searchParams"] }) {
  const raw = (await searchParams).next;
  const next = safeRedirectPath(Array.isArray(raw) ? raw[0] : raw, "/tai-khoan");
  const user = await requireUser(`/xac-thuc-email?next=${encodeURIComponent(next)}`);
  if (user.emailVerified) {
    return (
      <div className="space-y-4">
        <Notice tone="success">Email {user.email} đã được xác thực.</Notice>
        <ButtonLink href={next}>Tiếp tục</ButtonLink>
      </div>
    );
  }
  return <VerifyEmailForm email={user.email} next={next} />;
}

// Xác thực email bằng mã OTP sau khi đăng ký (nghiep-vu-ban-hang mục 15).
export default function VerifyEmailPage({ searchParams }: PageProps<"/xac-thuc-email">) {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight">Xác thực email</h1>
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Đang tải...</p>}>
        <Verify searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
