import { Suspense } from "react";
import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/validation";
import { PROVIDER_LABELS, enabledProviders } from "@/server/auth/oauth";
import { getCurrentUser } from "@/server/auth/session";
import { Notice } from "@/components/ui/Notice";
import { AuthForm } from "./AuthForm";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Lỗi đăng nhập Google, Facebook (?loi=, src/app/api/dang-nhap/[provider]/callback).
const OAUTH_ERRORS: Record<string, string> = {
  oauth_off: "Cách đăng nhập này chưa được bật.",
  oauth_failed: "Không đăng nhập được. Vui lòng thử lại.",
  oauth_no_email: "Tài khoản mạng xã hội không cung cấp email. Vui lòng đăng ký bằng email.",
  oauth_email_taken: "Email này đã có tài khoản. Hãy đăng nhập bằng mật khẩu rồi liên kết ở Cài đặt > Tài khoản & Bảo mật.",
  oauth_staff: "Tài khoản nhân viên đăng nhập ở trang quản trị.",
  oauth_locked: "Tài khoản đang bị khoá. Vui lòng liên hệ cửa hàng.",
  oauth_linked_elsewhere: "Tài khoản mạng xã hội này đã liên kết với một tài khoản khác.",
};

// Người đã đăng nhập được đưa thẳng tới trang đích.
async function Gate({ mode, searchParams }: { mode: "login" | "register"; searchParams: SearchParams }) {
  const params = await searchParams;
  const raw = params.next;
  const next = safeRedirectPath(Array.isArray(raw) ? raw[0] : raw, "");
  if (await getCurrentUser()) redirect(next || "/tai-khoan");
  const error = OAUTH_ERRORS[String(Array.isArray(params.loi) ? params.loi[0] : (params.loi ?? ""))];
  const providers = enabledProviders();
  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {mode === "login" && params["da-dat-lai"] === "1" && (
        <Notice tone="success">Đã đặt mật khẩu mới. Hãy đăng nhập bằng mật khẩu mới.</Notice>
      )}
      <AuthForm mode={mode} next={next} />
      {providers.length > 0 && (
        <div className="space-y-2">
          <p className="text-center text-xs text-muted">hoặc</p>
          {providers.map((provider) => (
            <a
              key={provider}
              href={`/api/dang-nhap/${provider}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="flex h-11 w-full items-center justify-center rounded-full border border-line bg-surface text-sm font-semibold transition hover:bg-raised"
            >
              {mode === "login" ? "Đăng nhập" : "Đăng ký"} bằng {PROVIDER_LABELS[provider]}
            </a>
          ))}
        </div>
      )}
    </>
  );
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
