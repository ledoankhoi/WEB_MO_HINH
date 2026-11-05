"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Heart, Home, LayoutGrid, Search, User } from "lucide-react";

// Thanh điều hướng dính dưới đáy màn hình điện thoại. Ẩn ở trang sản phẩm (đã có thanh mua hàng) và trang đặt hàng.
export function MobileTabBar({ imageSearch }: { imageSearch: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/san-pham/") || pathname === "/thanh-toan") return null;

  const tabs = [
    { href: "/", label: "Trang chủ", icon: Home, active: pathname === "/" },
    { href: "/san-pham", label: "Danh mục", icon: LayoutGrid, active: pathname === "/san-pham" },
    imageSearch
      ? { href: "/tim-bang-anh", label: "Tìm bằng ảnh", icon: Camera, active: pathname === "/tim-bang-anh", accent: true }
      : { href: "/san-pham?sap-xep=moi-nhat", label: "Mới về", icon: Search, active: false, accent: true },
    { href: "/tai-khoan#yeu-thich", label: "Yêu thích", icon: Heart, active: false },
    { href: "/tai-khoan", label: "Tài khoản", icon: User, active: pathname === "/tai-khoan" || pathname === "/dang-nhap" },
  ];

  return (
    <nav
      aria-label="Điều hướng chính"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t-3 border-ink bg-surface px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {tabs.map(({ href, label, icon: Icon, active, accent }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 font-condensed text-[13px] font-bold uppercase ${active ? "text-brand" : "text-fg"}`}
        >
          {accent ? (
            <span className="grid h-8 w-11 place-items-center border-2 border-ink bg-brand text-white">
              <Icon className="size-5" strokeWidth={2.4} aria-hidden />
            </span>
          ) : (
            <Icon className="size-[22px]" strokeWidth={active ? 2.6 : 2} aria-hidden />
          )}
          {label}
        </Link>
      ))}
    </nav>
  );
}
