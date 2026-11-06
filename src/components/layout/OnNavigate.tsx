"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function PathWatcher({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const last = useRef(pathname);
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  useEffect(() => {
    if (pathname === last.current) return;
    last.current = pathname;
    callback.current();
  }, [pathname]);
  return null;
}

// Gọi `onChange` khi sang trang khác (đổi pathname), ví dụ để đóng bảng đang mở ở đầu trang.
// `usePathname` nằm trong <Suspense> riêng: đầu trang vẫn dựng tĩnh được ở route động không có
// generateStaticParams (ví dụ /don-hang/[token]); gọi thẳng trong component cha thì `next build` báo lỗi prerender.
export function OnNavigate({ onChange }: { onChange: () => void }) {
  return (
    <Suspense fallback={null}>
      <PathWatcher onChange={onChange} />
    </Suspense>
  );
}
