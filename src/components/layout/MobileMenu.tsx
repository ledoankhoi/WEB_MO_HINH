"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export type NavLink = { href: string; label: string };

// Trình đơn cho màn hình nhỏ. `children` là ô tìm kiếm được dựng ở máy chủ.
export function MobileMenu({ links, children }: { links: NavLink[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Trang cũ được giữ lại ở trạng thái ẩn khi điều hướng: đóng trình đơn để lúc quay lại không thấy
  // nó đang mở sẵn.
  useLayoutEffect(() => () => setOpen(false), []);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid size-10 place-items-center rounded-full text-fg transition hover:bg-raised"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Đóng trình đơn" : "Mở trình đơn"}
      >
        {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
      </button>
      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full border-b border-line bg-bg/95 px-4 pt-3 pb-5 shadow-xl shadow-black/10 backdrop-blur-md"
        >
          {children}
          <nav className="mt-3 grid" aria-label="Trình đơn chính">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onNavigate={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium text-fg hover:bg-raised"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
