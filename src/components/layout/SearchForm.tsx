import Form from "next/form";
import { Search } from "lucide-react";

// Gửi đi là điều hướng tới /san-pham?q=... ngay trong trình duyệt, không tải lại cả trang.
export function SearchForm({ className = "", id = "site-search" }: { className?: string; id?: string }) {
  return (
    <Form action="/san-pham" className={`relative ${className}`} role="search">
      <label htmlFor={id} className="sr-only">
        Tìm kiếm sản phẩm
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Tìm kiếm mô hình..."
        maxLength={80}
        className="h-10 w-full rounded-full border border-line bg-surface pr-4 pl-10 text-sm text-fg placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none"
      />
    </Form>
  );
}
