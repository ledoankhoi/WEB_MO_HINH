"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type NavLink = { href: string; label: string };

const LINK =
  "inline-flex h-14 shrink-0 items-center gap-2 border-b-4 font-condensed text-lg font-extrabold tracking-[0.04em] text-white uppercase transition hover:text-white/80";

// Mục "Hàng mới về" (sắp xếp mới nhất) có nhãn "Mới".
const isNewArrivals = (href: string) => href.includes("sap-xep=moi-nhat");

// Liên kết đang mở: cùng đường dẫn và mọi tham số của liên kết khớp URL hiện tại; nhiều liên kết khớp thì chọn liên
// kết có nhiều tham số nhất (đang ở /san-pham?loai=transformers thì sáng "Transformers", không sáng "Cửa hàng").
function currentHref(links: NavLink[], pathname: string, params: URLSearchParams): string | null {
  let best: { href: string; score: number } | null = null;
  for (const link of links) {
    const url = new URL(link.href, "http://cua-hang.local");
    if (url.pathname !== pathname) continue;
    const entries = [...url.searchParams.entries()];
    if (!entries.every(([key, value]) => params.get(key) === value)) continue;
    if (!best || entries.length > best.score) best = { href: link.href, score: entries.length };
  }
  return best?.href ?? null;
}

function Items({ links, current }: { links: NavLink[]; current: string | null }) {
  return links.map((link) => {
    const active = link.href === current;
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? "page" : undefined}
        className={`${LINK} ${active ? "border-brand" : "border-transparent"} ${isNewArrivals(link.href) ? "ml-auto" : ""}`}
      >
        {link.label}
        {isNewArrivals(link.href) && <span className="-rotate-4 bg-white px-2 py-0.5 text-[13px] font-black text-ink">Mới</span>}
      </Link>
    );
  });
}

// Menu đầu trang (quản trị sửa ở /admin/noi-dung/menu) trên thanh đen. Đọc tham số URL nên đặt dưới <Suspense>
// với NavLinksFallback.
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <Items links={links} current={currentHref(links, pathname, new URLSearchParams(params.toString()))} />;
}

export function NavLinksFallback({ links }: { links: NavLink[] }) {
  return <Items links={links} current={null} />;
}
