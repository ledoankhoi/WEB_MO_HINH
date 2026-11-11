"use client";

import { useId, useState, type ReactNode } from "react";
import Form from "next/form";
import Link from "next/link";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { buttonClass } from "@/components/ui/button-style";
import { SORT_OPTIONS } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { PRICE_RANGES, priceRangeHref, shopHref, toggleHref, type ShopQuery } from "@/lib/shop-url";
import type { FilterOption } from "@/server/repo/products";

const OPTION =
  "flex w-full items-center justify-between gap-3 py-1.5 text-left text-[15px] font-medium decoration-2 underline-offset-4 hover:underline";
const INPUT =
  "h-10 w-full border-2 border-ink bg-surface px-2.5 text-sm tabular-nums text-fg focus:border-brand focus:outline-none";

type Group = { key: string; label: string; summary: string; panel: ReactNode };

// Một lựa chọn trong bảng: đang bật thì chữ đỏ kèm dấu tích; bấm lại thì tắt.
function Option({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined} className={`${OPTION} ${active ? "text-brand" : "text-fg"}`}>
      <span className="min-w-0">{children}</span>
      {active && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden />}
    </Link>
  );
}

// Cột dọc bên trái của khối "Tùy chọn sản phẩm" ở /san-pham: Giá, Thương hiệu, Series, Tình trạng, Sắp xếp. Mỗi mục là một
// hàng; bấm vào mục thì bảng lựa chọn mở ra ngay dưới mục đó, chen giữa mục đó và mục kế tiếp (các mục sau được
// đẩy xuống, không bị che). Bảng giữ nguyên trạng thái mở, kể cả sau khi chọn; bấm lại tên mục thì đóng. Mục đang lọc
// hiện giá trị bằng chữ đỏ dưới tên mục.
export function OptionsColumn({
  current,
  brands,
  series,
  priceMin,
  priceMax,
  className = "",
}: {
  current: ShopQuery;
  brands: FilterOption[];
  series: FilterOption[];
  priceMin: number;
  priceMax: number;
  className?: string;
}) {
  // Các mục đang mở. Mỗi mục mở, đóng độc lập bằng cách bấm vào tên mục; chọn một lựa chọn không đóng bảng. Trạng
  // thái này giữ nguyên khi chuyển trang lọc (cùng một component, chỉ đổi tham số URL).
  const [open, setOpen] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const baseId = useId();
  const toggle = (key: string) => setOpen((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  const minPrice = current["gia-tu"] ?? "";
  const maxPrice = current["gia-den"] ?? "";
  const priceSummary =
    minPrice || maxPrice ? `${minPrice ? formatVnd(Number(minPrice)) : "0 ₫"} – ${maxPrice ? formatVnd(Number(maxPrice)) : "không giới hạn"}` : "";
  const status = [current["con-hang"] === "1" && "Còn hàng", current["bien-hinh"] === "1" && "Có biến hình 3D"].filter(Boolean).join(", ");

  const list = (items: FilterOption[], key: string) => (
    <div className="max-h-80 overflow-y-auto pr-1">
      {items.map((item) => (
        <Option key={item.slug} href={toggleHref(current, key, item.slug)} active={current[key] === item.slug}>
          {item.name} <span className="text-sm text-muted">({item.count})</span>
        </Option>
      ))}
    </div>
  );

  const groups: Group[] = [
    {
      key: "gia",
      label: "Giá",
      summary: priceSummary,
      panel: (
        <div className="space-y-4">
          <div>
            {PRICE_RANGES.map((range) => {
              const { href, active } = priceRangeHref(current, range);
              return (
                <Option key={range.label} href={href} active={active}>
                  {range.label}
                </Option>
              );
            })}
          </div>
          {/* Khoảng giá tự nhập: form GET giữ nguyên các tuỳ chọn khác. Ô trống thì không đưa lên URL. */}
          <Form
            key={`${minPrice}-${maxPrice}`}
            action="/san-pham"
            scroll={false}
            onSubmitCapture={(event) => {
              for (const field of event.currentTarget.querySelectorAll<HTMLInputElement>("input[name]")) if (!field.value) field.disabled = true;
            }}
            className="space-y-2 border-t-2 border-line pt-3"
          >
            {Object.entries(current)
              .filter(([key, value]) => value && key !== "gia-tu" && key !== "gia-den")
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <p className="text-xs font-bold tracking-wider text-muted uppercase">Khoảng giá khác</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted">
                Từ
                <input name="gia-tu" type="number" inputMode="numeric" min={0} step={10000} defaultValue={minPrice} placeholder={String(priceMin)} className={INPUT} />
              </label>
              <label className="space-y-1 text-xs text-muted">
                Đến
                <input name="gia-den" type="number" inputMode="numeric" min={0} step={10000} defaultValue={maxPrice} placeholder={String(priceMax)} className={INPUT} />
              </label>
            </div>
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm", full: true })}>
              Áp dụng
            </button>
          </Form>
        </div>
      ),
    },
    ...(brands.length > 0
      ? [{ key: "thuong-hieu", label: "Thương hiệu", summary: brands.find((b) => b.slug === current["thuong-hieu"])?.name ?? "", panel: list(brands, "thuong-hieu") }]
      : []),
    ...(series.length > 0 ? [{ key: "series", label: "Series", summary: series.find((s) => s.slug === current.series)?.name ?? "", panel: list(series, "series") }] : []),
    {
      key: "tinh-trang",
      label: "Tình trạng",
      summary: status,
      panel: (
        <div>
          <Option href={toggleHref(current, "con-hang", "1")} active={current["con-hang"] === "1"}>
            Chỉ hiện còn hàng
          </Option>
          <Option href={toggleHref(current, "bien-hinh", "1")} active={current["bien-hinh"] === "1"}>
            Có biến hình, hợp thể 3D
          </Option>
        </div>
      ),
    },
    {
      // Sắp xếp: luôn có đúng một cách đang dùng, mặc định "Mới nhất" (không ghi lên URL).
      key: "sap-xep",
      label: "Sắp xếp",
      summary: SORT_OPTIONS.find((option) => option.value === current["sap-xep"])?.label ?? "",
      panel: (
        <div>
          {SORT_OPTIONS.map((option) => (
            <Option
              key={option.value}
              href={shopHref(current, { "sap-xep": option.value === "moi-nhat" ? "" : option.value })}
              active={(current["sap-xep"] || "moi-nhat") === option.value}
            >
              {option.label}
            </Option>
          ))}
        </div>
      ),
    },
  ];

  // Số tuỳ chọn lọc đang bật (không tính cách sắp xếp, vì "Bỏ tất cả tùy chọn" giữ nguyên cách sắp xếp).
  const activeCount = groups.filter((group) => group.summary && group.key !== "sap-xep").length;
  // "Bỏ tất cả tùy chọn" giữ từ khoá tìm kiếm, danh mục và cách sắp xếp.
  const clearHref = shopHref({ q: current.q ?? "", loai: current.loai ?? "", "sap-xep": current["sap-xep"] ?? "" });

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={`${baseId}-list`}
        className="flex h-12 w-full items-center gap-2 px-4 font-condensed text-lg font-extrabold uppercase lg:hidden"
      >
        <SlidersHorizontal className="size-4" strokeWidth={2.6} aria-hidden />
        Lọc và sắp xếp{activeCount > 0 && <span className="text-brand">({activeCount})</span>}
        <ChevronRight className={`ml-auto size-4 transition ${expanded ? "rotate-90" : ""}`} strokeWidth={2.6} aria-hidden />
      </button>

      <ul id={`${baseId}-list`} className={`${expanded ? "block border-t-2 border-line" : "hidden"} lg:block`}>
        {groups.map((group) => {
          const isOpen = open.includes(group.key);
          const panelId = `${baseId}-${group.key}`;
          return (
            <li key={group.key} className="border-b-2 border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(group.key)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${isOpen ? "bg-raised" : "hover:bg-raised"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block font-condensed text-lg leading-tight font-extrabold uppercase ${group.summary ? "text-brand" : "text-fg"}`}>{group.label}</span>
                  {group.summary && <span className="block truncate text-xs font-semibold text-brand">{group.summary}</span>}
                </span>
                <ChevronRight className={`size-4 shrink-0 transition ${isOpen ? "rotate-90 text-brand" : ""}`} strokeWidth={2.6} aria-hidden />
              </button>

              {/* Bảng mở ra bằng cách giãn chiều cao (lưới 0fr -> 1fr) cho mượt. Lúc đóng vẫn nằm trong trang để chạy hiệu
                  ứng, nhưng `inert` để không bấm hay chuyển tiêu điểm vào được. */}
              <div
                id={panelId}
                role="region"
                aria-label={group.label}
                inert={!isOpen}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t-2 border-line px-4 py-3">{group.panel}</div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {activeCount > 0 && (
        <Link
          href={clearHref}
          scroll={false}
          className={`${expanded ? "block" : "hidden"} border-t-3 border-ink px-4 py-3 text-sm font-bold text-brand hover:underline lg:block`}
        >
          Bỏ tất cả tùy chọn
        </Link>
      )}
    </div>
  );
}
