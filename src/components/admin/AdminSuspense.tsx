import { Suspense } from "react";

// Mỗi trang quản trị đọc phiên và dữ liệu bên trong ranh giới này. Khi chuyển trang trong khu quản trị, layout và
// thanh bên giữ nguyên, chỉ trang chạy lại; Suspense trong layout không bọc được phần đó, nên trang phải tự có
// ranh giới riêng để điều hướng không bị chặn (instant navigation của Next.js 16).
export function AdminSuspense({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="py-16 text-center text-sm text-muted">Đang tải...</p>}>{children}</Suspense>;
}
