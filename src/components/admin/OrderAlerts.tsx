"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { showToast } from "@/components/ui/Toaster";
import { formatVnd } from "@/lib/format";
import type { OrderPulse } from "@/lib/types";

const POLL_MS = 20_000;
const SEEN_KEY = "rs-admin-last-order";

function readSeen(): number | null {
  try {
    const value = window.localStorage.getItem(SEEN_KEY);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function writeSeen(value: number) {
  try {
    window.localStorage.setItem(SEEN_KEY, String(value));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất phần nhớ giữa các lần mở trang.
  }
}

// Hỏi máy chủ mỗi 20 giây (và khi quay lại tab) số đơn cần xử lý và đơn mới nhất. Có đơn mới thì hiện thông
// báo nổi kèm nút mở đơn, thêm số đơn cần xử lý vào tiêu đề tab, và làm mới danh sách nếu đang xem trang đơn.
// Trả về số đơn cần xử lý cho huy hiệu ở thanh bên.
export function useOrderAlerts(initial: OrderPulse | null): number {
  const [needsAction, setNeedsAction] = useState(initial?.needsAction ?? 0);
  // Máy chủ vẽ lại khung (sau một thao tác trên đơn) thì lấy số mới ngay, không chờ lần hỏi kế tiếp.
  const [source, setSource] = useState(initial);
  if (initial !== source) {
    setSource(initial);
    setNeedsAction(initial?.needsAction ?? 0);
  }
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!initial) return;
    let stopped = false;
    let known = initial.needsAction;
    // Lần đầu mở trang: đơn nào đã có trước đó coi như đã thấy, trừ khi lần trước chưa thấy nó.
    const seen = readSeen();
    if (initial.latest && seen !== null && initial.latest.createdAt > seen) announce(initial.latest);
    if (initial.latest) writeSeen(Math.max(initial.latest.createdAt, seen ?? 0));

    function announce(order: NonNullable<OrderPulse["latest"]>) {
      showToast(`Đơn hàng mới ${order.code} · ${order.customerName} · ${formatVnd(order.total)}`, {
        tone: "info",
        duration: 15_000,
        action: { href: `/admin/don-hang/${order.id}`, label: "Xem đơn" },
      });
    }

    async function poll() {
      if (stopped || document.visibilityState !== "visible") return;
      const response = await fetch("/admin/api/don-hang", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || stopped) return;
      const pulse = (await response.json()) as OrderPulse;
      const last = readSeen() ?? 0;
      const fresh = pulse.latest && pulse.latest.createdAt > last;
      if (pulse.latest && fresh) {
        writeSeen(pulse.latest.createdAt);
        announce(pulse.latest);
      }
      if (fresh || pulse.needsAction !== known) {
        known = pulse.needsAction;
        setNeedsAction(pulse.needsAction);
        // Đang xem tổng quan hoặc danh sách đơn thì làm mới để đơn mới hiện ngay.
        if (path.current === "/admin" || path.current === "/admin/don-hang") router.refresh();
      }
    }

    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => void poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial, router]);

  // Số đơn cần xử lý hiện trên tiêu đề tab, như "(3) Quản trị". Next.js đặt lại tiêu đề khi chuyển trang,
  // nên theo dõi thẻ <title> và gắn lại số mỗi khi nó đổi.
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
      const wanted = needsAction > 0 ? `(${needsAction}) ${base}` : base;
      if (document.title !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [needsAction]);

  return needsAction;
}
