import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/account/AuthForm";
import { first } from "@/components/admin/parts";
import { LogoMark } from "@/components/layout/Logo";
import { safeRedirectPath } from "@/lib/validation";
import { getStaffUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Đăng nhập quản trị" };

// Đã có phiên quản trị thì vào thẳng trang đích. Phiên đăng nhập ở cửa hàng không được tính.
async function Gate({ searchParams }: Pick<PageProps<"/admin/dang-nhap">, "searchParams">) {
  const next = safeRedirectPath(first((await searchParams).next), "/admin");
  if (await getStaffUser()) redirect(next);
  return <AuthForm mode="admin" next={next} />;
}

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/dang-nhap">) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <LogoMark className="size-12" />
          <h1 className="text-center text-2xl font-bold tracking-tight">Đăng nhập quản trị</h1>
        </div>
        <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Đang tải...</p>}>
          <Gate searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
