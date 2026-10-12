"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isProvince, type PaymentMethod } from "@/lib/catalog";
import type { FormState } from "@/lib/types";
import { isEmail, normalizePhone, readText } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { getPaymentMethods } from "@/server/payment";
import {
  cancelOrder,
  createOrder,
  findOrderByToken,
  findOrderTokenByCodeAndPhone,
  type CartIssue,
  type OrderLineInput,
} from "@/server/repo/orders";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";

const MINUTE = 60 * 1000;

export type CheckoutState = FormState & {
  // Token của đơn vừa tạo: trình duyệt dùng để chuyển tới trang đơn hàng.
  token?: string;
  issues?: string[];
};

// Giỏ hàng nằm ở trình duyệt nên dữ liệu gửi lên phải được kiểm tra từng trường.
function parseItems(raw: string): OrderLineInput[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50) return null;

  const items: OrderLineInput[] = [];
  for (const entry of parsed as { id?: unknown; qty?: unknown; price?: unknown }[]) {
    if (
      typeof entry?.id !== "string" ||
      !/^[a-z0-9]{1,40}$/i.test(entry.id) ||
      typeof entry.qty !== "number" ||
      !Number.isInteger(entry.qty) ||
      entry.qty < 1 ||
      entry.qty > 100 ||
      typeof entry.price !== "number" ||
      !Number.isInteger(entry.price) ||
      entry.price < 0
    ) {
      return null;
    }
    items.push({ productId: entry.id, quantity: entry.qty, expectedPrice: entry.price });
  }
  return items;
}

function describeIssue(issue: CartIssue): string {
  const name = issue.name ? `“${issue.name}”` : "Một sản phẩm";
  if (issue.reason === "unavailable") return `${name} hiện không còn bán.`;
  if (issue.reason === "insufficient_stock") return `${name} không còn đủ số lượng trong kho.`;
  return `Giá của ${name} vừa thay đổi.`;
}

export async function placeOrderAction(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const name = readText(form, "name");
  const phoneInput = readText(form, "phone");
  const email = readText(form, "email").toLowerCase();
  const address = readText(form, "address");
  const city = readText(form, "city");
  const note = readText(form, "note");
  const paymentMethod = readText(form, "paymentMethod");
  const values = { name, phone: phoneInput, email, address, city, note, paymentMethod };

  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Họ tên cần từ 2 đến 80 ký tự.";
  const phone = normalizePhone(phoneInput);
  if (!phone) errors.phone = "Số điện thoại không hợp lệ.";
  if (email && !isEmail(email)) errors.email = "Email không hợp lệ.";
  if (address.length < 5 || address.length > 200) errors.address = "Địa chỉ cần từ 5 đến 200 ký tự.";
  if (!isProvince(city)) errors.city = "Vui lòng chọn tỉnh, thành phố.";
  if (note.length > 500) errors.note = "Ghi chú tối đa 500 ký tự.";
  if (!(getPaymentMethods() as string[]).includes(paymentMethod)) {
    errors.paymentMethod = "Vui lòng chọn phương thức thanh toán.";
  }
  if (Object.keys(errors).length > 0 || !phone) {
    return { errors, values, message: "Vui lòng kiểm tra lại các thông tin được đánh dấu." };
  }

  const items = parseItems(readText(form, "items"));
  if (!items) return { values, message: "Giỏ hàng trống hoặc không hợp lệ. Vui lòng tải lại trang." };

  const limit = await consumeRateLimit(`order:${await getClientIp()}`, 20, 60 * MINUTE);
  if (!limit.allowed) {
    return { values, message: "Bạn đã đặt quá nhiều đơn trong thời gian ngắn. Vui lòng thử lại sau." };
  }

  const user = await getCurrentUser();
  const result = await createOrder({
    userId: user?.id ?? null,
    paymentMethod: paymentMethod as PaymentMethod,
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    shippingAddress: address,
    shippingCity: city,
    note,
    items,
  });

  if (!result.ok) {
    return {
      values,
      message:
        result.reason === "empty"
          ? "Giỏ hàng trống."
          : "Giỏ hàng vừa có thay đổi nên chưa thể đặt hàng. Vui lòng kiểm tra lại.",
      issues: result.issues.map(describeIssue),
    };
  }

  // Tồn kho đã thay đổi: làm mới dữ liệu sản phẩm đang được cache.
  updateTag(PRODUCTS_TAG);
  return { ok: true, token: result.order.token };
}

// Ai có liên kết đơn hàng (token) thì được huỷ đơn khi đơn còn chờ xác nhận.
export async function cancelOrderAction(token: string): Promise<FormState> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return { message: "Không tìm thấy đơn hàng." };
  }
  const order = await findOrderByToken(token);
  if (!order) return { message: "Không tìm thấy đơn hàng." };

  const cancelled = await cancelOrder(order.id, ["pending"]);
  if (!cancelled) {
    refresh();
    return { message: "Đơn hàng đã được xử lý nên không thể tự huỷ. Vui lòng liên hệ cửa hàng." };
  }
  updateTag(PRODUCTS_TAG);
  refresh();
  return { ok: true, message: "Đã huỷ đơn hàng." };
}

export async function lookupOrderAction(_prev: FormState, form: FormData): Promise<FormState> {
  const code = readText(form, "code").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const phoneInput = readText(form, "phone");
  const values = { code, phone: phoneInput };

  const phone = normalizePhone(phoneInput);
  if (code.length < 6 || code.length > 16 || !phone) {
    return { values, message: "Vui lòng nhập đúng mã đơn hàng và số điện thoại đã dùng khi đặt." };
  }

  const limit = await consumeRateLimit(`lookup:${await getClientIp()}`, 10, 15 * MINUTE);
  if (!limit.allowed) return { values, message: "Bạn tra cứu quá nhiều lần. Vui lòng thử lại sau ít phút." };

  const token = await findOrderTokenByCodeAndPhone(code, phone);
  if (!token) return { values, message: "Không tìm thấy đơn hàng khớp với mã và số điện thoại này." };

  redirect(`/don-hang/${token}`);
}
