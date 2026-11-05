"use client";

import { useLayoutEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { AnimateIcon, Menu, X } from "@/components/animate/icons";
import type { NavLink } from "./NavLinks";

// Trình đơn cho màn hình nhỏ: menu đầu trang của quản trị và các danh mục đang có hàng.
export function MobileMenu({ links, categories }: { links: NavLink[]; categories: { slug: string; name: string; count: number }[] }) {
  const [open, setOpen] = useState(false);

  // Trang cũ được giữ lại ở trạng thái ẩn khi điều hướng: đóng trình đơn để lúc quay lại không thấy
  // nó đang mở sẵn.
  useLayoutEffect(() => () => setOpen(false), []);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="grid size-11 place-items-center border-3 border-ink bg-surface"
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
            className="absolute inset-x-0 top-full max-h-[calc(100dvh-8rem)] overflow-y-auto border-y-3 border-ink bg-surface px-4 pt-3 pb-5 shadow-[0_10px_0_rgb(17_17_17/0.12)]"
          >
            <nav className="grid" aria-label="Trình đơn chính">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onNavigate={() => setOpen(false)}
                  className="flex items-center justify-between border-b-2 border-ink/10 px-1 py-3 font-condensed text-xl font-extrabold uppercase"
                >
                  {link.label}
                  <ChevronRight className="size-5" aria-hidden />
                </Link>
              ))}
            </nav>
            {categories.length > 0 && (
              <nav className="mt-5" aria-label="Danh mục">
                <p className="mb-2 font-condensed text-sm font-bold tracking-[0.08em] text-muted uppercase">Danh mục</p>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((category) => (
                    <Link
                      key={category.slug}
                      href={`/san-pham?loai=${category.slug}`}
                      onNavigate={() => setOpen(false)}
                      className="border-2 border-ink px-3 py-2.5 font-condensed text-base leading-tight font-extrabold uppercase"
                    >
                      {category.name}
                      <span className="block font-sans text-xs font-medium text-muted normal-case">{category.count} sản phẩm</span>
                    </Link>
                  ))}
                </div>
              </nav>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
