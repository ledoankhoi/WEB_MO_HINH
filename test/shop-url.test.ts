import { describe, expect, it } from "vitest";
import { PRICE_RANGES, priceRangeHref, shopHref, toggleHref } from "@/lib/shop-url";

describe("đường dẫn lọc của /san-pham (src/lib/shop-url.ts)", () => {
  const current = { q: "", loai: "transformers", "thuong-hieu": "hasbro", "gia-tu": "", "gia-den": "", "sap-xep": "gia-tang" };

  it("đổi một tuỳ chọn thì giữ các tuỳ chọn khác, bỏ ô trống và số trang", () => {
    expect(shopHref({ ...current, trang: "3" }, { series: "g1" })).toBe("/san-pham?loai=transformers&thuong-hieu=hasbro&sap-xep=gia-tang&series=g1");
    expect(shopHref({})).toBe("/san-pham");
  });

  it("bấm danh mục khác thì chọn danh mục đó; bấm lại danh mục đang chọn thì bỏ chọn, hiện tất cả", () => {
    expect(toggleHref(current, "loai", "figure")).toBe("/san-pham?loai=figure&thuong-hieu=hasbro&sap-xep=gia-tang");
    expect(toggleHref(current, "loai", "transformers")).toBe("/san-pham?thuong-hieu=hasbro&sap-xep=gia-tang");
  });

  it("khoảng giá có sẵn: bật thì đặt cả hai đầu, bấm lại khoảng đang bật thì bỏ lọc giá", () => {
    const under = PRICE_RANGES[0];
    const on = priceRangeHref(current, under);
    expect(on).toEqual({ active: false, href: "/san-pham?loai=transformers&thuong-hieu=hasbro&gia-den=999999&sap-xep=gia-tang" });
    const off = priceRangeHref({ ...current, "gia-den": "999999" }, under);
    expect(off).toEqual({ active: true, href: "/san-pham?loai=transformers&thuong-hieu=hasbro&sap-xep=gia-tang" });
  });
});
