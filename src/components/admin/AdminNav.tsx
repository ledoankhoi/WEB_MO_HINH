"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, ReceiptText, Users } from "lucide-react";
import { can, type Permission, type Role } from "@/lib/permissions";

// Nhóm theo menu ở mục 5 của docs/chuan/10. Mỗi mục chỉ hiện với vai trò có quyền mở trang đó; quyền
// vẫn được kiểm tra lại ở máy chủ.
const GROUPS: { label?: string; links: { href: string; label: string; icon: typeof Package; permission: Permission }[] }[] = [
  { links: [{ href: "/admin", label: "Tổng quan", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    label: "Danh mục hàng",
    links: [{ href: "/admin/san-pham", label: "Sản phẩm", icon: Package, permission: "catalog.view" }],
  },
  {
    label: "Bán hàng",
    links: [{ href: "/admin/don-hang", label: "Đơn hàng", icon: ReceiptText, permission: "orders.view" }],
  },
  {
    label: "Khách hàng",
    links: [{ href: "/admin/khach-hang", label: "Khách hàng", icon: Users, permission: "customers.view" }],
  },
];

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const groups = GROUPS.map((group) => ({ ...group, links: group.links.filter((link) => can(role, link.permission)) })).filter(
    (group) => group.links.length > 0,
  );

  return (
    <nav aria-label="Trình đơn quản trị" className="-mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0">
      {groups.map((group) => (
        <div key={group.label ?? ""} className="flex gap-1 lg:flex-col">
          {group.label && (
            <p className="hidden px-3 text-xs font-semibold tracking-wide text-muted uppercase lg:block">{group.label}</p>
          )}
          {group.links.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
                  active ? "bg-fg text-bg" : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
