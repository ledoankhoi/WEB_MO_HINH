// Luật chuyển trạng thái đơn hàng L1–L14 (docs/chuan/04 mục 5). Một bảng duy nhất: giao diện dùng để hiện
// nút, máy chủ dựng điều kiện SQL từ đúng bảng này nên hai bên không lệch nhau.
import type { OrderStatus, PaymentStatus, ShippingStatus } from "./catalog";
import type { Permission } from "./permissions";

type OrderState = {
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingStatus: ShippingStatus;
  paymentMethod: "cod" | "bank";
};

type Rule = {
  rule: string;
  label: string;
  // null: chủ đơn (L12), kiểm tra bằng liên kết đơn hàng thay vì quyền nhân viên.
  permission: Permission | null;
  when: { status?: OrderStatus[]; payment?: PaymentStatus[]; shipping?: ShippingStatus[]; codOrPaid?: boolean };
  set: { status?: OrderStatus; payment?: PaymentStatus; shipping?: ShippingStatus };
  // Biến động kho đi kèm (cùng giao dịch).
  stock?: "release" | "ship" | "return_in";
  payment?: "charge" | "refund";
  confirm?: string;
};

export const ORDER_ACTIONS = {
  mark_paid: { rule: "L2", label: "Ghi nhận đã thu tiền", permission: "payments.manage", when: { status: ["pending", "confirmed", "processing"], payment: ["unpaid"] }, set: { payment: "paid" }, payment: "charge", confirm: "Xác nhận đã nhận đủ tiền của đơn này?" },
  // Đơn chuyển khoản phải thu tiền trước khi xác nhận (quyết định 1 ở docs/chuan/04 mục 8).
  confirm: { rule: "L3", label: "Xác nhận đơn", permission: "orders.process", when: { status: ["pending"], codOrPaid: true }, set: { status: "confirmed" } },
  start_packing: { rule: "L4", label: "Bắt đầu đóng gói", permission: "orders.fulfil", when: { status: ["confirmed"] }, set: { status: "processing" } },
  packed: { rule: "L5", label: "Đóng gói xong", permission: "orders.fulfil", when: { status: ["processing"], shipping: ["not_created"] }, set: { shipping: "ready" } },
  hand_over: { rule: "L6", label: "Bàn giao vận chuyển", permission: "orders.fulfil", when: { shipping: ["ready"] }, set: { shipping: "in_transit" }, stock: "ship" },
  delivered: { rule: "L7", label: "Giao thành công", permission: "orders.process", when: { shipping: ["in_transit"] }, set: { shipping: "delivered" } },
  delivery_failed: { rule: "L9", label: "Giao thất bại", permission: "orders.process", when: { shipping: ["in_transit"] }, set: { shipping: "failed" } },
  redeliver: { rule: "L10", label: "Giao lại", permission: "orders.process", when: { shipping: ["failed"] }, set: { shipping: "in_transit" } },
  receive_return: { rule: "L11", label: "Nhận hàng hoàn về kho", permission: "orders.fulfil", when: { shipping: ["failed"] }, set: { shipping: "returned", status: "cancelled" }, stock: "return_in", confirm: "Hàng hoàn sẽ vào khu cách ly và đơn chuyển sang Đã huỷ. Tiếp tục?" },
  customer_cancel: { rule: "L12", label: "Huỷ đơn", permission: null, when: { status: ["pending"] }, set: { status: "cancelled" }, stock: "release" },
  cancel: { rule: "L13", label: "Huỷ đơn", permission: "orders.process", when: { status: ["pending", "confirmed", "processing"], shipping: ["not_created", "ready"] }, set: { status: "cancelled" }, stock: "release", confirm: "Huỷ đơn này và trả hàng đang giữ về kho?" },
  refund: { rule: "L14", label: "Ghi nhận đã hoàn tiền", permission: "payments.manage", when: { status: ["cancelled"], payment: ["paid"] }, set: { payment: "refunded" }, payment: "refund", confirm: "Xác nhận đã hoàn tiền cho khách?" },
} as const satisfies Record<string, Rule>;

export type OrderActionKey = keyof typeof ORDER_ACTIONS;
export const ORDER_ACTION_KEYS = Object.keys(ORDER_ACTIONS) as OrderActionKey[];
export const isOrderActionKey = (value: unknown): value is OrderActionKey =>
  typeof value === "string" && Object.hasOwn(ORDER_ACTIONS, value);

export function canApply(key: OrderActionKey, order: OrderState): boolean {
  const when: Rule["when"] = ORDER_ACTIONS[key].when;
  return (
    (!when.status || when.status.includes(order.status)) &&
    (!when.payment || when.payment.includes(order.paymentStatus)) &&
    (!when.shipping || when.shipping.includes(order.shippingStatus)) &&
    (!when.codOrPaid || order.paymentMethod === "cod" || order.paymentStatus === "paid")
  );
}

// Điều kiện SQL trên bảng orders, tương đương canApply.
export function conditionSql(key: OrderActionKey): { sql: string; args: string[] } {
  const when: Rule["when"] = ORDER_ACTIONS[key].when;
  const parts: string[] = [];
  const args: string[] = [];
  for (const [column, values] of [["status", when.status], ["payment_status", when.payment], ["shipping_status", when.shipping]] as const) {
    if (!values) continue;
    parts.push(`${column} IN (${values.map(() => "?").join(", ")})`);
    args.push(...values);
  }
  if (when.codOrPaid) parts.push("(payment_method = 'cod' OR payment_status = 'paid')");
  return { sql: parts.join(" AND "), args };
}
