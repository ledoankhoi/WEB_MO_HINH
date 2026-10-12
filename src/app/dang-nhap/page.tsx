import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";

export const metadata: Metadata = { title: "Đăng nhập", robots: { index: false } };

export default function LoginPage({ searchParams }: PageProps<"/dang-nhap">) {
  return <AuthPage mode="login" searchParams={searchParams} />;
}
