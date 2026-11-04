"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedNumber } from "@/components/animate/AnimatedNumber";
import { AnimateIcon, ShoppingCart } from "@/components/animate/icons";
import { useCartCount } from "@/lib/cart";

export function CartButton() {
  const count = useCartCount();
  // Mỗi khi số món tăng (vừa thêm vào giỏ), xe đẩy chạy hiệu ứng một lần.
  const previous = useRef(count);
  const [hovered, setHovered] = useState(false);
  const [bumping, setBumping] = useState(false);
  useEffect(() => {
    const grew = count > previous.current;
    previous.current = count;
    if (!grew) return;
    setBumping(true);
    const timer = window.setTimeout(() => setBumping(false), 900);
    return () => window.clearTimeout(timer);
  }, [count]);

  return (
    <AnimateIcon animate={hovered || bumping} asChild>
      <Link
        href="/gio-hang"
        className="relative grid size-10 place-items-center rounded-full text-fg transition hover:bg-raised hover:text-brand"
        aria-label={count > 0 ? `Giỏ hàng, ${count} sản phẩm` : "Giỏ hàng"}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <ShoppingCart className="size-5" aria-hidden />
        <AnimatePresence>
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-ink"
            >
              {count > 99 ? "99+" : <AnimatedNumber value={count} />}
            </motion.span>
          )}
        </AnimatePresence>
      </Link>
    </AnimateIcon>
  );
}
