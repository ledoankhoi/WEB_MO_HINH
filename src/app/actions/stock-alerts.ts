"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/lib/types";
import { isEmail, normalizePhone } from "@/lib/validation";
import { getCurrentUser } from "@/server/auth/session";
import { createStockAlert, markStockAlertsNotified, type StockAlertContact } from "@/server/repo/stock-alerts";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

export type StockAlertState = { ok: boolean; message: string; needContact?: boolean };

function parseContact(value: string): StockAlertContact | null {
  if (value.includes("@")) return isEmail(value) ? { contact: value.toLowerCase(), kind: "email" } : null;
  const phone = normalizePhone(value);
  return phone ? { contact: phone, kind: "phone" } : null;
}

// Khách đăng ký "Báo khi có hàng" cho một phiên bản đang hết. Đã đăng nhập mà để trống liên hệ thì dùng email tài
// khoản; khách chưa đăng nhập phải nhập email hoặc số điện thoại.
export async function requestStockAlertAction(variantId: string, contact: string): Promise<StockAlertState> {
  if (typeof variantId !== "string" || !/^[a-z0-9]{1,40}$/i.test(variantId) || typeof contact !== "string" || contact.length > 254) {
    return { ok: false, message: "Yêu cầu không hợp lệ." };
  }
  const user = await getCurrentUser();
  const value = contact.trim() || user?.email || "";
  if (!value) return { ok: false, needContact: true, message: "Nhập email hoặc số điện thoại để nhận tin khi có hàng." };
  const parsed = parseContact(value);
  if (!parsed) return { ok: false, needContact: true, message: "Email hoặc số điện thoại chưa đúng." };

  const result = await createStockAlert({ variantId, contact: parsed, userId: user?.id ?? null });
  if (result === "not_found") return { ok: false, message: "Sản phẩm này không còn bán." };
  if (result === "limit") return { ok: false, message: "Bạn đã đăng ký báo hàng cho quá nhiều sản phẩm đang chờ." };
  if (result === "duplicate") return { ok: true, message: "Bạn đã đăng ký báo hàng cho sản phẩm này rồi." };
  return {
    ok: true,
    message: `Đã ghi nhận. ROBOTICA sẽ báo qua ${parsed.kind === "email" ? "email" : "số điện thoại"} của bạn khi sản phẩm có hàng.`,
  };
}

// Quản trị: đánh dấu đã báo cho khách (sau khi nhân viên tự liên hệ).
export async function markStockAlertsNotifiedAction(ids: string[]): Promise<FormState> {
  const audit = await staffWith("customers.manage");
  if (!audit) return FORBIDDEN;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every(isId)) return { message: "Yêu cầu không hợp lệ." };
  const changed = await markStockAlertsNotified(ids, audit({ action: "stock_alert.notify", entity: "stock_alerts", summary: "Đánh dấu đã báo khách có hàng" }));
  if (changed === 0) return { message: "Các yêu cầu này đã được đánh dấu trước đó." };
  refresh();
  return { ok: true };
}
