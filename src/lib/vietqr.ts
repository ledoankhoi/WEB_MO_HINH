// Tạo chuỗi dữ liệu mã VietQR (chuẩn EMVCo của NAPAS) cho chuyển khoản tới số tài khoản,
// kèm sẵn số tiền và nội dung. Ứng dụng ngân hàng quét mã sẽ điền đủ thông tin cho khách.

export type VietQrInput = {
  // Mã BIN 6 số của ngân hàng thụ hưởng, ví dụ 970436 (Vietcombank).
  bin: string;
  accountNumber: string;
  amount: number;
  memo: string;
};

function field(id: string, value: string): string {
  if (value.length === 0 || value.length > 99) throw new Error(`Trường ${id} của VietQR có độ dài không hợp lệ`);
  return id + String(value.length).padStart(2, "0") + value;
}

// CRC-16/CCITT-FALSE (đa thức 0x1021, giá trị đầu 0xFFFF), trả về 4 ký tự hex in hoa.
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) throw new Error("Dữ liệu VietQR chỉ được chứa ký tự ASCII");
    crc ^= code << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Nội dung chuyển khoản chỉ giữ chữ không dấu, số và khoảng trắng để mọi ngân hàng đều hiển thị đúng.
export function sanitizeMemo(memo: string): string {
  return memo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

export function buildVietQrPayload(input: VietQrInput): string {
  if (!/^\d{6}$/.test(input.bin)) throw new Error("Mã BIN ngân hàng phải gồm 6 chữ số");
  if (!/^[A-Za-z0-9]{4,19}$/.test(input.accountNumber)) throw new Error("Số tài khoản không hợp lệ");
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Số tiền phải là số nguyên dương");

  const beneficiary = field("00", input.bin) + field("01", input.accountNumber);
  const merchantAccount =
    field("00", "A000000727") + // định danh NAPAS
    field("01", beneficiary) +
    field("02", "QRIBFTTA"); // chuyển nhanh tới số tài khoản

  const memo = sanitizeMemo(input.memo);
  const payload =
    field("00", "01") +
    field("01", "12") + // mã động: dùng cho một giao dịch có sẵn số tiền
    field("38", merchantAccount) +
    field("53", "704") + // VND
    field("54", String(input.amount)) +
    field("58", "VN") +
    (memo ? field("62", field("08", memo)) : "") +
    "6304";

  return payload + crc16(payload);
}
