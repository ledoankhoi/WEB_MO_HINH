import { describe, expect, it } from "vitest";
import { discountPercent, foldText, formatDate, formatDateTime, formatVnd, slugify } from "@/lib/format";
import { clampQuantity, orderTotals, shippingFee } from "@/lib/pricing";

describe("formatVnd", () => {
  it("chèn dấu chấm phân cách hàng nghìn", () => {
    expect(formatVnd(2_490_000)).toBe("2.490.000 ₫");
    expect(formatVnd(990_000)).toBe("990.000 ₫");
    expect(formatVnd(0)).toBe("0 ₫");
    expect(formatVnd(999)).toBe("999 ₫");
  });
});

describe("ngày giờ Việt Nam", () => {
  it("luôn tính theo múi giờ +7", () => {
    // 2026-10-09T17:30:00Z là 00:30 ngày 10/10 ở Việt Nam.
    const ms = Date.UTC(2026, 9, 9, 17, 30);
    expect(formatDate(ms)).toBe("10/10/2026");
    expect(formatDateTime(ms)).toBe("00:30 10/10/2026");
  });
});

describe("foldText và slugify", () => {
  it("bỏ dấu tiếng Việt kể cả chữ đ", () => {
    expect(foldText("  Robot  Hình Người  ")).toBe("robot hinh nguoi");
    expect(foldText("Đồng hành")).toBe("dong hanh");
  });

  it("khớp chuỗi dựng sẵn và chuỗi tổ hợp", () => {
    expect(foldText("ề")).toBe(foldText("ề"));
  });

  it("tạo slug chỉ gồm chữ thường, số và gạch nối", () => {
    expect(slugify("Titan MK-II (bản 2026)")).toBe("titan-mk-ii-ban-2026");
    expect(slugify("  Nhện máy 6 chân!  ")).toBe("nhen-may-6-chan");
  });
});

describe("giá và phí vận chuyển", () => {
  it("tính phần trăm giảm giá", () => {
    expect(discountPercent(790_000, 890_000)).toBe(11);
    expect(discountPercent(1000, null)).toBeNull();
    expect(discountPercent(1000, 1000)).toBeNull();
  });

  it("miễn phí vận chuyển từ ngưỡng cấu hình", () => {
    expect(shippingFee(0)).toBe(0);
    expect(shippingFee(999_999)).toBe(30_000);
    expect(shippingFee(1_000_000)).toBe(0);
  });

  it("cộng tổng đơn hàng", () => {
    expect(orderTotals([{ price: 400_000, quantity: 2 }])).toEqual({ subtotal: 800_000, shipping: 30_000, total: 830_000 });
    expect(orderTotals([{ price: 990_000, quantity: 2 }])).toEqual({ subtotal: 1_980_000, shipping: 0, total: 1_980_000 });
  });

  it("giới hạn số lượng theo tồn kho và mức tối đa", () => {
    expect(clampQuantity(3, 10)).toBe(3);
    expect(clampQuantity(99, 4)).toBe(4);
    expect(clampQuantity(99, 500)).toBe(10);
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(2, 0)).toBe(0);
    expect(clampQuantity(Number.NaN, 5)).toBe(1);
  });
});
