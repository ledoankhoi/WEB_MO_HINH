import { Suspense } from "react";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/session";
import { AuthForm } from "./AuthForm";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Người đã đăng nhập được đưa thẳng tới trang đích.
async function Gate({ mode, searchParams }: { mode: "login" | "register"; searchParams: SearchParams }) {
  const raw = (await searchParams).next;
  const next = safeRedirectPath(Array.isArray(raw) ? raw[0] : raw, "");
  if (await getCurrentUser()) redirect(next || "/tai-khoan");
  return <AuthForm mode={mode} next={next} />;
}

export function AuthPage({ mode, searchParams }: { mode: "login" | "register"; searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight">{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
      <Suspense fallback={<p className="py-10 text-center text-sm text-muted">Đang tải...</p>}>
        <Gate mode={mode} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
