import { Suspense } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/account/AccountForms";
import { AdminNav } from "@/components/admin/AdminNav";
import { LogoMark } from "@/components/layout/Logo";
import { site } from "@/config/site";
import { requireAdmin } from "@/server/auth/session";

// Kiểm tra quyền trước khi vẽ khung để người ngoài không thấy gì của khu quản trị. Layout không chạy lại
// khi chuyển trang trong khu này, nên mỗi trang vẫn tự gọi requireAdmin().
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="flex flex-col gap-3 border-b border-line bg-surface p-4 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:gap-6 lg:border-r lg:border-b-0">
        <Link href="/admin" className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-base font-bold tracking-[0.18em]">{site.name}</span>
          <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-muted">Quản trị</span>
        </Link>

        <AdminNav />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:mt-auto lg:flex-col lg:items-stretch lg:border-t lg:border-line lg:pt-4">
          <p className="min-w-0 flex-1 truncate">
            <span className="font-medium">{user.name}</span> <span className="text-muted">{user.email}</span>
          </p>
          <Link href="/" className="font-medium text-brand-strong hover:underline">
            Xem cửa hàng
          </Link>
          <LogoutButton admin />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

export default function AdminPanelLayout({ children }: LayoutProps<"/admin">) {
  return (
    // Đọc cookie phiên và tham số URL chỉ làm được lúc có yêu cầu, nên cả khu quản trị nằm dưới Suspense.
    <Suspense fallback={<p className="grid flex-1 place-items-center text-sm text-muted">Đang tải...</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
