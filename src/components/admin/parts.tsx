import Link from "next/link";

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
