"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AnimateIcon, Menu, X } from "@/components/animate/icons";

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
        {/* Biểu tượng xoay nhẹ khi đổi giữa ba gạch và dấu X. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "close" : "open"}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid"
          >
            <AnimateIcon animateOnHover>
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </AnimateIcon>
          </motion.span>
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-x-0 top-full border-b border-line bg-bg/95 px-4 pt-3 pb-5 shadow-xl shadow-black/10 backdrop-blur-md"
          >
            {children}
            <nav className="mt-3 grid" aria-label="Trình đơn chính">
              {links.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * index + 0.05 }}
                >
                  <Link
                    href={link.href}
                    onNavigate={() => setOpen(false)}
                    className="block rounded-xl px-3 py-3 text-base font-medium text-fg hover:bg-raised"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
