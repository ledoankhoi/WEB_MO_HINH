import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quản trị", robots: { index: false } };

// Khung có thanh bên nằm ở (panel)/layout.tsx; trang đăng nhập đứng ngoài nhóm đó.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
