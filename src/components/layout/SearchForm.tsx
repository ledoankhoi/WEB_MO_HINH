"use client";

import { useState } from "react";
import Form from "next/form";
import { Search } from "@/components/animate/icons";

// Gửi đi là điều hướng tới /san-pham?q=... ngay trong trình duyệt, không tải lại cả trang.
// Kính lúp "soi" một vòng khi rê chuột vào ô. Không bọc <Form> bằng AnimateIcon asChild: Slot của Animate UI
// không dựng được <Form> ở máy chủ (lệch hydration), nên tự theo dõi rê chuột.
export function SearchForm({ className = "", id = "site-search" }: { className?: string; id?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Form
      action="/san-pham"
      className={`relative ${className}`}
      role="search"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <label htmlFor={id} className="sr-only">
        Tìm kiếm sản phẩm
      </label>
      <Search
        animate={hovered}
        animation="find"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
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
