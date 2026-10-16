import "server-only";
import { notFound } from "next/navigation";
import { maskEmail, maskPhone, maskText } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "./auth/session";

// Trang khách hàng mở cho người có customers.view, và cho vai trò viewer với thông tin cá nhân bị che (SEC-02).
export async function requireCustomerAccess(returnTo: string) {
  const user = await requireStaff("dashboard.view", returnTo);
  const full = can(user.role, "customers.view");
  if (!full && user.role !== "viewer") notFound();
  return { user, masked: !full };
}

// Che email, số điện thoại, địa chỉ ở máy chủ khi người xem không có customers.view.
export function maskContact<T extends { email?: string; phone?: string; address?: string }>(item: T, masked: boolean): T {
  if (!masked) return item;
  return {
    ...item,
    ...(item.email !== undefined && { email: maskEmail(item.email) }),
    ...(item.phone !== undefined && { phone: maskPhone(item.phone) }),
    ...(item.address !== undefined && { address: maskText(item.address) }),
  };
}
