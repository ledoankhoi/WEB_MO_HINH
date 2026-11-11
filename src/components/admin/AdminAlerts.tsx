"use client";

import { createContext, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { showToast } from "@/components/ui/Toaster";
import { ALERT_KEYS, ALERT_KINDS, alertTotal, type AdminAlerts, type AlertEvent } from "@/lib/admin-alerts";

const POLL_MS = 20_000;
const EMPTY: AdminAlerts = { counts: {}, events: [] };
const AlertsContext = createContext<AdminAlerts>(EMPTY);

// Mốc việc mới nhất đã báo của từng loại, nhớ giữa các lần mở trang (mỗi trình duyệt một bản).
const seenKey = (kind: AlertEvent["kind"]) => `rs-admin-seen:${kind}`;
function readSeen(kind: AlertEvent["kind"]): number | null {
  try {
    // Bản cũ chỉ báo đơn hàng và lưu ở khoá này.
    const value = window.localStorage.getItem(seenKey(kind)) ?? (kind === "orders" ? window.localStorage.getItem("rs-admin-last-order") : null);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}
function writeSeen(kind: AlertEvent["kind"], value: number) {
  try {
    window.localStorage.setItem(seenKey(kind), String(value));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ mất phần nhớ giữa các lần mở trang.
  }
}

function announce(event: AlertEvent) {
  showToast(event.text, {
    tone: "info",
    duration: 15_000,
    action: { href: event.href, label: "Xem" },
  });
}

// Giữ thông báo của khu quản trị cho nút chuông và huy hiệu thanh bên. Hỏi máy chủ mỗi 20 giây (và ngay khi quay
// lại tab): số việc đổi thì cập nhật, có đơn, bài, đánh giá mới thì hiện thông báo nổi (tab đang ẩn thì để dành tới
// khi quay lại), và làm mới trang đang xem nếu đó là trang của việc vừa đổi. Tổng số việc hiện trên tiêu đề tab.
export function AdminAlertsProvider({ initial, children }: { initial: AdminAlerts; children: React.ReactNode }) {
  const [alerts, setAlerts] = useState(initial);
  // Máy chủ vẽ lại khung (sau một thao tác) thì lấy số mới ngay, không chờ lần hỏi kế tiếp.
  const [source, setSource] = useState(initial);
  if (initial !== source) {
    setSource(initial);
    setAlerts(initial);
  }
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    let stopped = false;
    let known = initial.counts;
    const queued: AlertEvent[] = [];

    // Lần đầu mở trang: việc đã có từ trước coi như đã thấy, trừ khi lần trước chưa thấy nó.
    const take = (events: AlertEvent[], firstLoad: boolean) => {
      for (const event of events) {
        const seen = readSeen(event.kind);
        if (seen !== null && event.at <= seen) continue;
        writeSeen(event.kind, event.at);
        if (firstLoad && seen === null) continue;
        if (document.visibilityState === "visible") announce(event);
        else queued.push(event);
      }
    };
    take(initial.events, true);

    async function poll() {
      if (stopped) return;
      const response = await fetch("/admin/api/thong-bao", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok || stopped) return;
      const next = (await response.json()) as AdminAlerts;
      take(next.events, false);
      const changed = ALERT_KEYS.filter((key) => next.counts[key] !== known[key]);
      if (changed.length === 0) return;
      known = next.counts;
      setAlerts(next);
      // Đang xem tổng quan hoặc trang của việc vừa đổi thì làm mới để thấy ngay.
      const current = path.current;
      if (current === "/admin" || changed.some((key) => ALERT_KINDS[key].nav === current || ALERT_KINDS[key].href.split("?")[0] === current)) router.refresh();
    }

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      for (const event of queued.splice(0)) announce(event);
      void poll();
    };
    const timer = window.setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [initial, router]);

  // Tổng số việc hiện trên tiêu đề tab, như "(3) Quản trị". Next.js đặt lại tiêu đề khi chuyển trang, nên theo dõi
  // thẻ <title> và gắn lại số mỗi khi nó đổi.
  const total = alertTotal(alerts);
  useEffect(() => {
    const apply = () => {
      // Trình duyệt chuẩn hoá khoảng trắng khi đọc document.title, nên phải so trên chuỗi đã chuẩn hoá. Lúc chuyển
      // trang Next.js để tiêu đề rỗng một lúc: không ghép số vào chuỗi rỗng ("(2) " đọc lại thành "(2)", khác nhau mãi,
      // từng gây vòng lặp treo trang), chờ lần đổi tiêu đề kế tiếp.
      const current = document.title.replace(/\s+/g, " ").trim();
      const base = current.replace(/^\(\d+\+?\)\s*/, "");
      if (!base) return;
      const wanted = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
      if (current !== wanted) document.title = wanted;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [total]);

  return <AlertsContext value={alerts}>{children}</AlertsContext>;
}

export const useAdminAlerts = () => use(AlertsContext);

const DOT = { urgent: "bg-danger", warn: "bg-warning" } as const;

export function CountBadge({ count, tone, label }: { count: number; tone: "urgent" | "warn"; label: string }) {
  return (
    <span
      className={`ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-bold text-white tabular-nums ${DOT[tone]}`}
      aria-label={label}
      title={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Huy hiệu của một mục thanh bên: cộng các loại thông báo gắn vào mục đó; đỏ nếu có việc phải làm.
export function navBadge({ counts }: AdminAlerts, href: string): { count: number; tone: "urgent" | "warn"; label: string } | null {
  const kinds = ALERT_KEYS.filter((key) => ALERT_KINDS[key].nav === href && (counts[key] ?? 0) > 0);
  if (kinds.length === 0) return null;
  return {
    count: kinds.reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    tone: kinds.some((key) => ALERT_KINDS[key].tone === "urgent") ? "urgent" : "warn",
    label: kinds.map((key) => `${counts[key]} ${ALERT_KINDS[key].label.toLowerCase()}`).join(", "),
  };
}

// Nút chuông đầu thanh bên: tổng số việc, bấm thì mở danh sách việc đang chờ (đỏ trước, vàng sau), mỗi dòng dẫn tới
// trang đã lọc sẵn. Bấm ra ngoài hoặc Esc thì đóng.
export function NotificationBell() {
  const alerts = useAdminAlerts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const total = alertTotal(alerts);
  const items = ALERT_KEYS.filter((key) => (alerts.counts[key] ?? 0) > 0).toSorted(
    (a, b) => Number(ALERT_KINDS[a].tone === "warn") - Number(ALERT_KINDS[b].tone === "warn"),
  );
  const hasUrgent = items.some((key) => ALERT_KINDS[key].tone === "urgent");

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          open ? "border-fg bg-fg text-bg" : "border-line text-fg hover:bg-raised"
        }`}
      >
        <Bell className={`size-4 shrink-0 ${total > 0 && !open ? "text-danger" : ""}`} aria-hidden />
        Thông báo
        {total > 0 && <CountBadge count={total} tone={hasUrgent ? "urgent" : "warn"} label={`${total} việc đang chờ`} />}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-2 shadow-lg">
          <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">Việc đang chờ</p>
          {items.length === 0 ? (
            <p className="px-2 pb-3 text-sm text-muted">Không có việc nào đang chờ.</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((key) => {
                const kind = ALERT_KINDS[key];
                return (
                  <li key={key}>
                    <Link href={kind.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-raised">
                      <span className={`size-2 shrink-0 rounded-full ${DOT[kind.tone]}`} aria-hidden />
                      <span className="min-w-0 flex-1">{kind.label}</span>
                      <span className="font-semibold tabular-nums">{alerts.counts[key]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-line px-2 pt-2 text-xs text-muted">Tự cập nhật mỗi 20 giây. Đơn, bài, đánh giá mới hiện thông báo ở góc màn hình.</p>
        </div>
      )}
    </div>
  );
}
