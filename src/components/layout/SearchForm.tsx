"use client";

import { useEffect, useId, useRef, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Search } from "lucide-react";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { transformLabel } from "@/lib/model-features";
import type { SearchSuggestions } from "@/lib/search-suggest";
import { OnNavigate } from "./OnNavigate";

type Option = { id: string; href: string };

const EMPTY: SearchSuggestions = { terms: [], products: [], total: 0 };
// Kết quả gợi ý đã tải, dùng lại khi khách xoá bớt rồi gõ lại.
const memo = new Map<string, SearchSuggestions>();

// Ô tìm kiếm ở đầu trang. Gửi đi là điều hướng tới /san-pham?q=... ngay trong trình duyệt. Khi gõ từ 2 ký tự, hiện
// gợi ý (cụm từ và sản phẩm, lấy từ /api/goi-y); mũi tên lên xuống chọn, Enter mở, Esc đóng.
// `imageSearch`: có nút "Bằng ảnh" mở trang tìm bằng ảnh (/tim-bang-anh).
export function SearchForm({ className = "", id = "site-search", imageSearch = false }: { className?: string; id?: string; imageSearch?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState("");
  // Lần tải gần nhất: vẫn hiện trong lúc chờ kết quả của từ khoá mới.
  const [latest, setLatest] = useState<SearchSuggestions>(EMPTY);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const query = value.replace(/\s+/g, " ").trim();
  const data = query.length < 2 ? EMPTY : (memo.get(query) ?? latest);

  useEffect(() => {
    if (query.length < 2 || memo.has(query)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/goi-y?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<SearchSuggestions>) : EMPTY))
        .then((body) => {
          if (memo.size > 100) memo.clear();
          memo.set(query, body);
          setLatest(body);
          setActive(-1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const options: Option[] = [
    ...data.terms.map((term, index) => ({ id: `${listId}-t${index}`, href: `/san-pham?q=${encodeURIComponent(term)}` })),
    ...data.products.map((product, index) => ({ id: `${listId}-p${index}`, href: `/san-pham/${product.slug}` })),
  ];
  const showPanel = open && query.length >= 2 && (data.terms.length > 0 || data.products.length > 0);

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    input.current?.blur();
    router.push(href);
  };

  const optionClass = (optionId: string) =>
    `flex cursor-pointer items-center gap-3 px-3 py-2 ${options[active]?.id === optionId ? "bg-raised" : "hover:bg-raised"}`;

  return (
    <Form action="/san-pham" role="search" className={`relative ${className}`} onSubmit={() => setOpen(false)}>
      {/* Sang trang khác thì đóng gợi ý. */}
      <OnNavigate
        onChange={() => {
          setOpen(false);
          setActive(-1);
        }}
      />
      <div className="flex h-12 items-stretch border-3 border-ink bg-surface sm:h-14">
        <label htmlFor={id} className="sr-only">
          Tìm kiếm sản phẩm
        </label>
        <span className="grid place-items-center pr-1 pl-3.5" aria-hidden>
          <Search className="size-5" strokeWidth={2.4} />
        </span>
        <input
          ref={input}
          id={id}
          name="q"
          type="search"
          value={value}
          placeholder="Tìm robot, mã mẫu, dòng phim…"
          maxLength={80}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-activedescendant={showPanel && active >= 0 ? options[active]?.id : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActive(-1);
            } else if (event.key === "ArrowDown" && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActive((index) => (index + 1) % options.length);
            } else if (event.key === "ArrowUp" && options.length > 0) {
              event.preventDefault();
              setActive((index) => (index <= 0 ? options.length - 1 : index - 1));
            } else if (event.key === "Enter" && showPanel && active >= 0 && options[active]) {
              event.preventDefault();
              go(options[active].href);
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2 text-base font-medium text-fg placeholder:text-muted focus:outline-none"
        />
        {imageSearch && (
          <Link
            href="/tim-bang-anh"
            aria-label="Tìm bằng ảnh"
            className="flex items-center gap-1.5 border-l-3 border-ink px-3 font-condensed text-[17px] font-extrabold whitespace-nowrap uppercase transition hover:bg-raised"
          >
            <Camera className="size-5" strokeWidth={2.4} aria-hidden />
            <span className="hidden md:inline">Bằng ảnh</span>
          </Link>
        )}
        <button
          type="submit"
          className="border-l-3 border-ink bg-brand px-4 font-condensed text-xl font-black text-white uppercase italic transition hover:brightness-110 sm:px-5"
        >
          Tìm
        </button>
      </div>

      {showPanel && (
        <div
          className="absolute inset-x-0 top-full z-50 mt-2 border-3 border-ink bg-surface shadow-[8px_8px_0_var(--color-ink)]"
          // Giữ tiêu điểm ở ô nhập khi bấm vào gợi ý.
          onMouseDown={(event) => event.preventDefault()}
        >
          <ul id={listId} role="listbox" aria-label="Gợi ý tìm kiếm" className="max-h-[70vh] overflow-y-auto py-2">
            {data.terms.length > 0 && (
              <li role="group" aria-label="Từ khoá gợi ý">
                <p aria-hidden className="px-3 pt-1 pb-1.5 font-condensed text-sm font-bold tracking-[0.08em] text-muted uppercase">
                  Từ khoá gợi ý
                </p>
                <ul role="none">
                  {data.terms.map((term, index) => {
                    const optionId = `${listId}-t${index}`;
                    const typedPart = term.toLowerCase().startsWith(query.toLowerCase()) ? term.slice(0, query.length) : "";
                    return (
                      <li
                        key={term}
                        id={optionId}
                        role="option"
                        aria-selected={options[active]?.id === optionId}
                        className={optionClass(optionId)}
                        onClick={() => go(`/san-pham?q=${encodeURIComponent(term)}`)}
                      >
                        <Search className="size-4 shrink-0 text-muted" aria-hidden />
                        <span className="text-[15px]">
                          {typedPart}
                          <strong className="font-bold">{term.slice(typedPart.length)}</strong>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
            {data.products.length > 0 && (
              <li role="group" aria-label="Sản phẩm" className={data.terms.length > 0 ? "mt-2 border-t-2 border-ink/10 pt-2" : ""}>
                <p aria-hidden className="px-3 pt-1 pb-1.5 font-condensed text-sm font-bold tracking-[0.08em] text-muted uppercase">
                  Sản phẩm
                </p>
                <ul role="none">
                  {data.products.map((product, index) => {
                    const optionId = `${listId}-p${index}`;
                    const sticker = transformLabel(product.modelUrl);
                    return (
                      <li
                        key={product.slug}
                        id={optionId}
                        role="option"
                        aria-selected={options[active]?.id === optionId}
                        className={optionClass(optionId)}
                        onClick={() => go(`/san-pham/${product.slug}`)}
                      >
                        <span className="halftone grid size-12 shrink-0 place-items-center border-2 border-ink">
                          {product.image && (
                            // Ảnh nhỏ của kho media, không qua bộ tối ưu ảnh.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image} alt="" className="size-full object-contain p-0.5" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-condensed text-[17px] font-bold uppercase">{product.name}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            {getCategory(product.category)?.name}
                            {sticker && <span className="bg-brand px-1.5 py-px font-condensed text-xs font-bold text-white uppercase">{sticker}</span>}
                            {product.stock <= 0 && <span className="font-semibold text-brand-strong">Hết hàng</span>}
                          </span>
                        </span>
                        <span className="font-condensed text-lg font-black whitespace-nowrap italic tabular-nums">{formatVnd(product.price)}</span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t-3 border-ink bg-raised px-3 py-2.5">
            <button type="submit" className="font-condensed text-base font-extrabold text-cobalt uppercase hover:underline">
              Xem tất cả {data.total} kết quả cho “{query}”
            </button>
            {imageSearch && (
              <Link href="/tim-bang-anh" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                <Camera className="size-4" aria-hidden />
                Không nhớ tên? Tìm bằng ảnh
              </Link>
            )}
          </div>
        </div>
      )}
    </Form>
  );
}
