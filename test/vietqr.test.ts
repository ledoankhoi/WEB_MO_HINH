import { describe, expect, it } from "vitest";
import { buildVietQrPayload, crc16, sanitizeMemo } from "@/lib/vietqr";

describe("crc16", () => {
  it("khớp giá trị kiểm tra chuẩn của CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("từ chối ký tự ngoài ASCII", () => {
    expect(() => crc16("đ")).toThrow();
  });
});

describe("buildVietQrPayload", () => {
  it("tạo đúng chuỗi mẫu đã công bố (150.000 ₫ tới 0123456789 tại BIN 970423)", () => {
    expect(buildVietQrPayload({ bin: "970423", accountNumber: "0123456789", amount: 150_000, memo: "DH123456" })).toBe(
      "00020101021238540010A00000072701240006970423011001234567890208QRIBFTTA530370454061500005802VN62120808DH123456630479AB",
    );
  });

  it("bỏ trường nội dung khi không có nội dung", () => {
    const payload = buildVietQrPayload({ bin: "970436", accountNumber: "1234567890", amount: 2_490_000, memo: "" });
    expect(payload).not.toContain("5802VN62");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("kiểm tra dữ liệu đầu vào", () => {
    const valid = { bin: "970436", accountNumber: "1234567890", amount: 1000, memo: "RB" };
    expect(() => buildVietQrPayload({ ...valid, bin: "97043" })).toThrow();
    expect(() => buildVietQrPayload({ ...valid, accountNumber: "12 34" })).toThrow();
    expect(() => buildVietQrPayload({ ...valid, amount: 0 })).toThrow();
    expect(() => buildVietQrPayload({ ...valid, amount: 10.5 })).toThrow();
  });
});

describe("sanitizeMemo", () => {
  it("bỏ dấu và ký tự đặc biệt", () => {
    expect(sanitizeMemo("Đơn hàng  RB-7K3M9QXT!")).toBe("Don hang RB7K3M9QXT");
  });
});
