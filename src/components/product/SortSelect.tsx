"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORT_OPTIONS } from "@/lib/catalog";

// Ô sắp xếp trên thanh công cụ của /san-pham: đổi là điều hướng, giữ các bộ lọc khác, về trang 1.
export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Sắp xếp
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(params);
          next.delete("trang");
          if (event.target.value === "moi-nhat") next.delete("sap-xep");
          else next.set("sap-xep", event.target.value);
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
        className="h-10 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
