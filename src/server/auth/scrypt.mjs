// Băm mật khẩu bằng scrypt (có sẵn trong Node.js, không cần thư viện ngoài).
// Viết bằng JavaScript thuần để cả ứng dụng lẫn scripts/admin.mjs dùng chung một cách băm.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Tham số theo khuyến nghị OWASP cho scrypt: N=2^15, r=8, p=3 (khoảng 32 MB bộ nhớ mỗi lần băm).
const LOG_N = 15;
const R = 8;
const P = 3;
const MAX_MEMORY = 128 * 1024 * 1024;

/**
 * @param {string} password
 * @param {Buffer} salt
 * @param {number} logN
 * @param {number} r
 * @param {number} p
 * @returns {Promise<Buffer>}
 */
function derive(password, salt, logN, r, p) {
  return new Promise((resolve, reject) => {
    // NFKC để cùng một mật khẩu tiếng Việt gõ theo kiểu dựng sẵn hay tổ hợp đều cho cùng kết quả.
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { N: 2 ** logN, r, p, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/**
 * @param {unknown} password
 * @returns {password is string}
 */
export function isValidPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

/**
 * Trả về chuỗi dạng `scrypt$15$8$3$<salt>$<hash>` để sau này đổi tham số vẫn kiểm tra được mật khẩu cũ.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, LOG_N, R, P);
  return ["scrypt", LOG_N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/**
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  const [scheme, logN, r, p, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const params = [Number(logN), Number(r), Number(p)];
  if (!params.every((n) => Number.isInteger(n) && n > 0) || params[0] > 20) return false;
  if (typeof password !== "string" || password.length > PASSWORD_MAX_LENGTH) return false;

  const expected = Buffer.from(hashText, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await derive(password, Buffer.from(saltText, "base64url"), params[0], params[1], params[2]);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
