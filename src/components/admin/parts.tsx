import Link from "next/link";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export const pageNumber = (value: string | string[] | undefined) =>
  Math.min(Math.max(Number.parseInt(first(value), 10) || 1, 1), 100_000);

export const isId = (value: string) => /^[a-f0-9]{20}$/.test(value);

export const chip = (active: boolean) =>
  `rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${
    active ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted hover:border-fg/30 hover:text-fg"
  }`;

export const BADGE = "rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

// Bảng rộng hơn màn hình điện thoại thì cuộn ngang trong khung, không làm tràn cả trang.
export const TABLE_WRAP = "overflow-x-auto rounded-xl border border-line bg-surface";
export const TABLE = "w-full text-left text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3 [&_th]:font-medium [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-line";

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Phân trang" className="flex items-center justify-center gap-3 text-sm">
      {page > 1 && (
        <Link href={href(page - 1)} className={chip(false)}>
          Trước
        </Link>
      )}
      <span className="text-muted">
        Trang {page} / {pages}
      </span>
      {page < pages && (
        <Link href={href(page + 1)} className={chip(false)}>
          Sau
        </Link>
      )}
    </nav>
  );
}

export type ChipGroup = { label: string; items: { key: string; href: string; label: string; active: boolean }[] };

// Khung "Bộ lọc" đóng/mở dùng chung cho các trang danh sách quản trị: gom các hàng chip lọc
// và form tìm kiếm vào một chỗ. Đóng khi chưa lọc gì; tự mở và hiện nhãn khi đang lọc.
export function FilterPanel({
  active,
  clearHref,
  groups = [],
  children,
}: {
  active: string[];
  clearHref: string;
  groups?: ChipGroup[];
  children?: React.ReactNode;
}) {
  return (
    <details open={active.length > 0} className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
        Bộ lọc
        {active.length > 0 ? (
          <span className="flex min-w-0 flex-wrap gap-1.5 font-normal">
            {active.map((label) => (
              <span key={label} className={BADGE}>
                {label}
              </span>
            ))}
          </span>
        ) : (
          <span className="font-normal text-muted">Chưa lọc</span>
        )}
        <ChevronDown className="ml-auto size-4 shrink-0 transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4">
        {groups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{group.label}</p>
            <nav aria-label={`Lọc theo ${group.label.toLowerCase()}`} className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <Link key={item.key} href={item.href} className={chip(item.active)}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        ))}
        {children}
        {active.length > 0 && (
          <Link href={clearHref} className="inline-block text-sm font-medium text-muted underline-offset-4 hover:text-fg hover:underline">
            Xoá bộ lọc
          </Link>
        )}
      </div>
    </details>
  );
}
