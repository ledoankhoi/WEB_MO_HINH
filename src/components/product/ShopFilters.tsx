"use client";

import { useRef, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { SlidersHorizontal } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/animate/RadioGroup";
import { Switch } from "@/components/animate/Switch";
import { Button } from "@/components/ui/Button";
import type { FilterOption } from "@/server/repo/products";

export type ShopFilterValues = {
  q: string;
  sort: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  brand: string;
  series: string;
};

// Giá trị của mục "Tất cả" (Radix không nhận giá trị rỗng); trang bỏ qua slug không phải danh mục.
const ALL = "tat-ca";
const LEGEND = "mb-3 text-xs font-bold tracking-wider text-muted uppercase";
const SELECT =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none";
const INPUT =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm tabular-nums text-fg focus:border-brand focus:ring-2 focus:ring-brand/25 focus:outline-none";

// Cột lọc của /san-pham: một form GET, nên kết quả lọc nằm trên URL (chia sẻ, quay lại được). Đổi danh mục,
// công tắc hay ô chọn thì gửi ngay; khoảng giá gửi khi bấm Áp dụng. Trên điện thoại cột lọc gập lại.
export function ShopFilters({
  values,
  categories,
  brands,
  series,
  priceMin,
  priceMax,
  activeCount,
}: {
  values: ShopFilterValues;
  categories: { slug: string; name: string }[];
  brands: FilterOption[];
  series: FilterOption[];
  priceMin: number;
  priceMax: number;
  activeCount: number;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  // Radix cập nhật ô input ẩn của radio, công tắc sau khi vẽ lại, nên gửi form ở lượt sau.
  const submit = () => window.setTimeout(() => form.current?.requestSubmit(), 0);

  return (
    <aside aria-label="Bộ lọc" className="w-full lg:sticky lg:top-24 lg:w-64 lg:shrink-0 lg:self-start">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="shop-filters"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-line bg-surface text-sm font-semibold lg:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Bộ lọc{activeCount > 0 && ` (${activeCount})`}
      </button>

      <Form
        ref={form}
        id="shop-filters"
        action="/san-pham"
        // Bỏ ô trống và mục "Tất cả" khỏi URL (ô bị tắt không vào FormData). Form vẽ lại sau mỗi lần lọc.
        onSubmitCapture={(event) => {
          for (const field of event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]")) {
            if (!field.value || field.value === ALL) field.disabled = true;
          }
        }}
        className={`${open ? "mt-3 block" : "hidden"} space-y-6 rounded-2xl border border-line bg-surface p-5 lg:mt-0 lg:block`}
      >
        {values.q && <input type="hidden" name="q" value={values.q} />}
        {values.sort && <input type="hidden" name="sap-xep" value={values.sort} />}

        <div className="flex items-center justify-between">
          <p className="font-bold">Bộ lọc</p>
          {activeCount > 0 && (
            <Link href={values.q ? `/san-pham?q=${encodeURIComponent(values.q)}` : "/san-pham"} className="text-sm font-semibold text-brand-strong hover:underline">
              Xoá tất cả
            </Link>
          )}
        </div>

        <div>
          <p id="loc-danh-muc" className={LEGEND}>
            Danh mục
          </p>
          <RadioGroup name="loai" defaultValue={values.category || ALL} onValueChange={submit} aria-labelledby="loc-danh-muc" className="gap-1">
            {[{ slug: ALL, name: "Tất cả" }, ...categories].map((category) => (
              <label key={category.slug} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-raised">
                <RadioGroupItem value={category.slug} />
                {category.name}
              </label>
            ))}
          </RadioGroup>
        </div>

        <fieldset>
          <legend className={LEGEND}>Khoảng giá</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs text-muted">
              Từ
              <input
                name="gia-tu"
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                defaultValue={values.minPrice}
                placeholder={String(priceMin)}
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-xs text-muted">
              Đến
              <input
                name="gia-den"
                type="number"
                inputMode="numeric"
                min={0}
                step={10000}
                defaultValue={values.maxPrice}
                placeholder={String(priceMax)}
                className={INPUT}
              />
            </label>
          </div>
          <Button type="submit" variant="secondary" size="sm" full className="mt-3">
            Áp dụng
          </Button>
        </fieldset>

        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
          Chỉ hiện còn hàng
          <Switch name="con-hang" value="1" defaultChecked={values.inStock} onCheckedChange={submit} />
        </label>

        {brands.length > 0 && (
          <label className="block space-y-2">
            <span className={`${LEGEND} block`}>Thương hiệu</span>
            <select name="thuong-hieu" defaultValue={values.brand} onChange={submit} className={SELECT}>
              <option value="">Tất cả thương hiệu</option>
              {brands.map((brand) => (
                <option key={brand.slug} value={brand.slug}>
                  {brand.name} ({brand.count})
                </option>
              ))}
            </select>
          </label>
        )}

        {series.length > 0 && (
          <label className="block space-y-2">
            <span className={`${LEGEND} block`}>Series</span>
            <select name="series" defaultValue={values.series} onChange={submit} className={SELECT}>
              <option value="">Tất cả series</option>
              {series.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
          </label>
        )}
      </Form>
    </aside>
  );
}
