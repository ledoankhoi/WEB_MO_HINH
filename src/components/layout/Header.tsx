import { Suspense } from "react";
import Link from "next/link";
import { AccountButton, AccountButtonFallback } from "./AccountButton";
import { CartButton } from "./CartButton";
import { Logo } from "./Logo";
import { getNavigation } from "@/server/catalog";
import { MobileMenu, type NavLink } from "./MobileMenu";
import { SearchForm } from "./SearchForm";

// Menu đầu trang lấy từ CSDL, quản trị sửa ở /admin/noi-dung/menu (YC-CMS-03).
export async function Header() {
  const NAV_LINKS: NavLink[] = (await getNavigation()).header.map((item) => ({ href: item.url, label: item.label }));
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/90 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="ml-4 hidden items-center lg:flex" aria-label="Trình đơn chính">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-2.5 py-2 text-sm font-medium whitespace-nowrap text-muted transition hover:text-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <SearchForm className="ml-auto hidden w-56 xl:block" />
        <div className="ml-auto flex items-center gap-0.5 xl:ml-2">
          {/* Chỉ phần này phụ thuộc phiên đăng nhập; phần còn lại của đầu trang nằm trong khung tĩnh. */}
          <Suspense fallback={<AccountButtonFallback />}>
            <AccountButton />
          </Suspense>
          <CartButton />
          <MobileMenu links={NAV_LINKS}>
            <SearchForm id="site-search-mobile" />
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
