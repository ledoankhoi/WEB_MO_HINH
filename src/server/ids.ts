import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

// Khoá chính dạng hex, không chứa dấu gạch để ghép vào đường dẫn ảnh an toàn.
export function newId(): string {
  return randomBytes(10).toString("hex");
}

// Token ngẫu nhiên không đoán được (mặc định 256 bit), dùng cho phiên đăng nhập và liên kết đơn hàng.
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Bỏ các ký tự dễ nhầm (0/O, 1/I/L) vì khách phải đọc và gõ lại mã này khi chuyển khoản.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newOrderCode(): string {
  let code = "RB";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
