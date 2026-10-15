import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";

export const metadata: Metadata = { title: "Tạo tài khoản", robots: { index: false } };

export default function RegisterPage({ searchParams }: PageProps<"/dang-ky">) {
  return <AuthPage mode="register" searchParams={searchParams} />;
}
