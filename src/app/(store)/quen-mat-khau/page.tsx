import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/account/PasswordResetForms";

export const metadata: Metadata = { title: "Quên mật khẩu", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="text-center text-3xl font-bold tracking-tight">Quên mật khẩu</h1>
      <ForgotPasswordForm />
    </div>
  );
}
