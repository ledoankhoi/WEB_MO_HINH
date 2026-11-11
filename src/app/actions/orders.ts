"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { isProvince, type PaymentMethod } from "@/lib/catalog";
import { couponMessage } from "@/lib/pricing";
import { onlinePayable } from "@/lib/preorder";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import { OTP_MESSAGES, checkOtp, consumeOtp } from "@/server/repo/otp";
import { isTaxCode } from "@/server/repo/invoices";
import type { FormState } from "@/lib/types";
import { isEmail, normalizePhone, readText } from "@/lib/validation";
import { parseConfig } from "@/lib/workshop";
import { getCurrentUser } from "@/server/auth/session";
import { PRODUCTS_TAG } from "@/server/catalog";
import { evaluateCoupon } from "@/server/repo/coupons";
import { findCartProducts } from "@/server/repo/products";
import { getPaymentMethods } from "@/server/payment";
import {
  applyOrderAction,
  createOrder,
  findOrderByToken,
  findOrderTokenByCodeAndPhone,
  type CartIssue,
  type OrderLineInput,
} from "@/server/repo/orders";
import { consumeRateLimit } from "@/server/repo/rate-limit";
import { getClientIp } from "@/server/request";
import { notifyOrderEvent } from "@/server/email/order-mails";
import { startVnpayPayment } from "@/server/payments/checkout";

const MINUTE = 60 * 1000;

export type CheckoutState = FormState & {
  // Token của đơn vừa tạo: trình duyệt dùng để chuyển tới trang đơn hàng.
  token?: string;
  // Thanh toán online: trình duyệt chuyển tới cổng thay vì trang đơn.
  payUrl?: string;
  issues?: string[];
  // Mã giảm giá bị từ chối lúc đặt: trình duyệt bỏ mã đang áp.
  couponRejected?: boolean;
  // Đơn COD giá trị lớn cần mã OTP: trình duyệt hiện ô nhập mã.
  otpRequired?: boolean;
};

const readCouponCode = (value: unknown) => {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9_-]{3,30}$/.test(code) ? code : null;
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
  for (const entry of parsed as { id?: unknown; qty?: unknown; price?: unknown; cfg?: unknown; pre?: unknown }[]) {
    // cfg: cấu hình Xưởng; máy chủ kiểm tra chi tiết và tính giá ở createOrder (src/lib/workshop.ts).
    if (entry?.cfg !== undefined && (typeof entry.cfg !== "string" || entry.cfg.length > 200)) return null;
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
    // pre: khách thấy dòng là hàng đặt trước (giỏ gửi 1 hoặc 0); máy chủ so lại với đợt đặt trước hiện tại.
    if (entry.pre !== undefined && entry.pre !== 0 && entry.pre !== 1) return null;
    items.push({
      variantId: entry.id,
      quantity: entry.qty,
      expectedPrice: entry.price,
      cfg: typeof entry.cfg === "string" ? entry.cfg : "",
      ...(entry.pre === undefined ? {} : { preorder: entry.pre === 1 }),
    });
  }
  return items;
}

function describeIssue(issue: CartIssue): string {
  const name = issue.name ? `“${issue.name}”` : "Một sản phẩm";
  if (issue.reason === "unavailable") return `${name} hiện không còn bán.`;
  if (issue.reason === "insufficient_stock") return `${name} không còn đủ số lượng trong kho.`;
  if (issue.reason === "preorder_full") return `${name} đã hết suất đặt trước hoặc ngừng nhận đặt.`;
  if (issue.reason === "flash_limit") return `${name} đã vượt số lượng được mua với giá flash sale.`;
  if (issue.reason === "preorder_changed") return `${name} vừa đổi giữa hàng có sẵn và hàng đặt trước.`;
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
  // Hoá đơn VAT (mục 17): chỉ kiểm khi khách tick yêu cầu.
  const wantsInvoice = form.get("vatInvoice") === "on";
  const invoice = {
    companyName: readText(form, "companyName"),
    taxCode: readText(form, "taxCode").replace(/\s+/g, ""),
    companyAddress: readText(form, "companyAddress"),
    invoiceEmail: readText(form, "invoiceEmail").toLowerCase(),
  };
  if (wantsInvoice) {
    Object.assign(values, invoice, { vatInvoice: "on" });
    if (invoice.companyName.length < 3 || invoice.companyName.length > 200) errors.companyName = "Tên công ty từ 3 đến 200 ký tự.";
    if (!isTaxCode(invoice.taxCode)) errors.taxCode = "Mã số thuế gồm 10 số (chi nhánh: 10 số, gạch ngang, 3 số).";
    if (invoice.companyAddress.length < 5 || invoice.companyAddress.length > 300) errors.companyAddress = "Địa chỉ công ty từ 5 đến 300 ký tự.";
    if (!isEmail(invoice.invoiceEmail)) errors.invoiceEmail = "Email nhận hoá đơn không hợp lệ.";
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
  // COD giá trị lớn (mục 15): email tài khoản đã xác thực trùng email của đơn, hoặc mã OTP gửi tới email của đơn đúng.
  // Mã chỉ đánh dấu đã dùng khi đơn tạo xong.
  const otp = readText(form, "otp").replace(/\s+/g, "");
  const trusted = !!user?.emailVerified && !!email && user.email === email;
  let otpId: string | null = null;
  if (paymentMethod === "cod" && !trusted && otp) {
    if (!email) return { values, errors: { email: "Nhập email để nhận mã xác nhận." }, message: "Vui lòng kiểm tra lại các thông tin được đánh dấu.", otpRequired: true };
    const check = await checkOtp("cod_order", email, otp);
    if (!check.ok) return { values, errors: { otp: OTP_MESSAGES[check.reason] }, message: OTP_MESSAGES[check.reason], otpRequired: true };
    otpId = check.id;
  }
  const result = await createOrder({
    userId: user?.id ?? null,
    paymentMethod: paymentMethod as PaymentMethod,
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    shippingAddress: address,
    shippingCity: city,
    note,
    couponCode: readCouponCode(form.get("couponCode")) ?? undefined,
    paymentPlan: readText(form, "paymentPlan") === "full" ? "full" : "deposit",
    codOtp: { from: site.codOtpFrom, verified: trusted || otpId !== null },
    invoice: wantsInvoice ? invoice : undefined,
    idempotencyKey: /^[0-9a-f]{32}$/.test(readText(form, "idempotencyKey")) ? readText(form, "idempotencyKey") : null,
    items,
  });

  if (!result.ok && result.reason === "coupon") return { values, message: couponMessage(result.coupon, result.minSubtotal), couponRejected: true };
  if (!result.ok && result.reason === "otp_required") {
    return {
      values,
      errors: email ? { otp: "Nhập mã xác nhận đã gửi tới email." } : { email: "Đơn này cần email để nhận mã xác nhận." },
      message: `Đơn thanh toán khi nhận hàng từ ${formatVnd(site.codOtpFrom)} cần xác nhận bằng mã gửi tới email.`,
      otpRequired: true,
    };
  }
  if (!result.ok && result.reason === "prepayment") {
    return { values, errors: { paymentMethod: "Trả đủ trước thì chọn chuyển khoản hoặc VNPay." }, message: "Hàng đặt trước cần trả trước: chọn đặt cọc, hoặc trả đủ bằng chuyển khoản, VNPay." };
  }
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

  if (otpId) await consumeOtp(otpId);
  // Tồn kho đã thay đổi: làm mới dữ liệu sản phẩm đang được cache.
  updateTag(PRODUCTS_TAG);
  await notifyOrderEvent(result.order.id, "placed");
  if (paymentMethod === "vnpay") {
    // Lỗi tạo lượt thanh toán không làm mất đơn: khách thanh toán lại ở trang đơn.
    const payUrl = await startVnpayPayment(result.order, await getClientIp()).catch((error) => {
      console.error("[vnpay] Không tạo được lượt thanh toán", result.order.code, error);
      return null;
    });
    if (payUrl) return { ok: true, token: result.order.token, payUrl };
  }
  return { ok: true, token: result.order.token };
}

// Thanh toán lại đơn VNPay chưa trả (lượt trước hết hạn, khách huỷ, sai OTP...), hoặc trả phần còn lại sau khi đã cọc hàng
// đặt trước. Liên kết đơn là bằng chứng chủ đơn.
export async function payAgainAction(token: string): Promise<FormState & { payUrl?: string }> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) return { message: "Yêu cầu không hợp lệ." };
  const limit = await consumeRateLimit(`pay:${await getClientIp()}`, 20, 15 * MINUTE);
  if (!limit.allowed) return { message: "Bạn thử quá nhiều lần. Vui lòng đợi ít phút." };
  const order = await findOrderByToken(token);
  if (!order || order.paymentMethod !== "vnpay" || !onlinePayable(order)) {
    return { message: "Đơn này không cần thanh toán online." };
  }
  const payUrl = await startVnpayPayment(order, await getClientIp());
  return payUrl ? { ok: true, payUrl } : { message: "Cổng VNPay đang tạm tắt. Vui lòng thử lại sau hoặc liên hệ cửa hàng." };
}

// Xem trước mã giảm giá ở trang thanh toán. Giá lấy từ CSDL; lúc đặt hàng máy chủ kiểm tra lại từ đầu.
export async function previewCouponAction(code: string, rawItems: string): Promise<{ ok: true; code: string; discount: number } | { ok: false; message: string }> {
  const normalized = readCouponCode(code);
  const items = typeof rawItems === "string" ? parseItems(rawItems) : null;
  if (!normalized || !items) return { ok: false, message: "Mã giảm giá không hợp lệ." };
  // Chặn dò mã hàng loạt.
  const limit = await consumeRateLimit(`coupon:${await getClientIp()}`, 30, 15 * MINUTE);
  if (!limit.allowed) return { ok: false, message: "Bạn thử mã quá nhiều lần. Vui lòng thử lại sau ít phút." };
  // Đơn giá gồm tuỳ chọn Xưởng, tính lại ở máy chủ; cấu hình không hợp lệ thì bỏ dòng đó (đặt hàng sẽ báo giỏ đã đổi).
  const products = new Map((await findCartProducts(items.map((i) => i.variantId))).map((p) => [p.id, p]));
  const lines = items.flatMap((i) => {
    const product = products.get(i.variantId);
    const config = product ? parseConfig(i.cfg ?? "", product.category) : null;
    return product && config ? [{ variantId: i.variantId, price: product.price + config.price, quantity: i.quantity }] : [];
  });
  const result = await evaluateCoupon(normalized, lines);
  return result.ok ? { ok: true, code: result.coupon.code, discount: result.discount } : { ok: false, message: couponMessage(result.reason, result.minSubtotal) };
}

// Ai có liên kết đơn hàng (token) thì được huỷ đơn khi đơn còn chờ xác nhận.
export async function cancelOrderAction(token: string): Promise<FormState> {
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return { message: "Không tìm thấy đơn hàng." };
  }
  const order = await findOrderByToken(token);
  if (!order) return { message: "Không tìm thấy đơn hàng." };

  const cancelled = await applyOrderAction(order.id, "customer_cancel");
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
