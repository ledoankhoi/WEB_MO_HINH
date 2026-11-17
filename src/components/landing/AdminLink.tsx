"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { adminUrl } from "@/lib/landing";

const subscribe = () => () => {};

// Liên kết mở website quản trị trong thẻ mới. Trang quản trị ở tên miền riêng (`host` = ADMIN_HOST) nên địa chỉ chỉ
// dựng được ở trình duyệt, theo giao thức và cổng của trang đang xem; lúc dựng HTML trên máy chủ dùng địa chỉ không cổng.
export function AdminLink({ host, className = "", children }: { host: string; className?: string; children: ReactNode }) {
  const href = useSyncExternalStore(
    subscribe,
    () => adminUrl(host, window.location),
    () => `http://${host}/admin`,
  );
  return (
    <a href={href} target="_blank" rel="noopener" className={className}>
      {children}
    </a>
  );
}
