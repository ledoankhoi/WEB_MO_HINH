import "server-only";
import { site } from "@/config/site";
import { PAYMENT_METHOD_LABELS } from "@/lib/catalog";
import { formatDate, formatVnd } from "@/lib/format";
import type { OrderActionKey } from "@/lib/order-flow";
import type { Order } from "@/lib/types";
import { findOrderById } from "../repo/orders";
import { getBaseUrl } from "../request";
import { sendMail } from "./mailer";
import { layout } from "./templates";

// Đơn có hàng đặt trước: ngày về muộn nhất trong các dòng, và lời dặn về cọc (src/lib/preorder.ts).
function preorderLines(order: Order): string[] {
  const dates = order.items.flatMap((item) => (item.preorder ? [item.preorder.expectedAt] : []));
  if (dates.length === 0) return [];
  const lines = [`Đơn có hàng đặt trước, dự kiến về khoảng ${formatDate(Math.max(...dates))}. Cửa hàng giao một lần khi hàng về đủ và sẽ báo bạn khi hàng về.`];
  if (order.depositAmount > 0) {
    lines.push(
      `Tiền cọc cần trả trước: ${formatVnd(order.depositAmount)}${order.paymentMethod === "vnpay" ? " (qua VNPay)" : `, chuyển khoản với nội dung ${order.code}`}. Phần còn lại ${formatVnd(order.total - order.depositAmount)} trả khi nhận hàng hoặc trả trước ở trang đơn.`,
    );
  }
  return lines;
}

// Email báo đơn hàng (docs/ke-hoach/nghiep-vu-ban-hang.md, mục 3). Thư giao dịch: luôn gửi, không phụ thuộc lựa chọn
// nhận tin khuyến mãi. Bước nào không có trong MESSAGES (đóng gói, đóng gói xong...) thì không gửi để khách khỏi bị làm phiền.

export type OrderMailEvent = "placed" | OrderActionKey;

type Message = { subject: (code: string) => string; title: string; lines: (order: Order) => string[] };

const MESSAGES: Partial<Record<OrderMailEvent, Message>> = {
  placed: {
    subject: (code) => `Đã nhận đơn hàng ${code}`,
    title: "Cảm ơn bạn đã đặt hàng",
    lines: (order) => [
      `Chúng tôi đã nhận đơn ${order.code} và sẽ xác nhận sớm.`,
      `Hình thức thanh toán: ${PAYMENT_METHOD_LABELS[order.paymentMethod]}.` +
        (order.paymentMethod === "bank" || order.depositAmount > 0 ? " Thông tin chuyển khoản và mã VietQR có ở trang đơn hàng." : ""),
      ...preorderLines(order),
    ],
  },
  mark_paid: { subject: (code) => `Đã nhận thanh toán đơn ${code}`, title: "Đã nhận thanh toán", lines: (order) => [`Cửa hàng đã nhận đủ ${formatVnd(order.total)} cho đơn ${order.code}.`] },
  mark_deposit: {
    subject: (code) => `Đã nhận tiền cọc đơn ${code}`,
    title: "Đã nhận tiền cọc",
    lines: (order) => [
      `Cửa hàng đã nhận ${formatVnd(order.depositAmount)} tiền cọc cho đơn ${order.code}. Suất đặt trước của bạn đã được giữ.`,
      `Phần còn lại ${formatVnd(order.total - order.depositAmount)} trả khi nhận hàng, hoặc trả trước ở trang đơn khi hàng về.`,
    ],
  },
  confirm: { subject: (code) => `Đơn ${code} đã được xác nhận`, title: "Đơn hàng đã được xác nhận", lines: (order) => [`Đơn ${order.code} đã được xác nhận và đang được chuẩn bị.`] },
  hand_over: {
    subject: (code) => `Đơn ${code} đang được giao`,
    title: "Đơn hàng đang trên đường giao",
    lines: (order) => [
      `Đơn ${order.code} đã được giao cho đơn vị vận chuyển.`,
      order.trackingCode ? `Mã vận đơn: ${order.trackingCode}${order.trackingCarrier ? ` (${order.trackingCarrier})` : ""}.` : "",
    ].filter(Boolean),
  },
  delivered: {
    subject: (code) => `Đơn ${code} đã giao thành công`,
    title: "Giao hàng thành công",
    lines: (order) => [`Đơn ${order.code} đã được giao. Chúc bạn vui với món đồ mới!`, "Bạn có thể đánh giá sản phẩm ở trang tài khoản để nhận xu."],
  },
  delivery_failed: {
    subject: (code) => `Giao đơn ${code} chưa thành công`,
    title: "Chưa giao được hàng",
    lines: (order) => [`Đơn vị vận chuyển chưa giao được đơn ${order.code}. Cửa hàng sẽ liên hệ để giao lại.`],
  },
  customer_cancel: { subject: (code) => `Đơn ${code} đã huỷ`, title: "Đơn hàng đã huỷ", lines: (order) => [`Bạn đã huỷ đơn ${order.code}.`] },
  cancel: {
    subject: (code) => `Đơn ${code} đã huỷ`,
    title: "Đơn hàng đã huỷ",
    lines: (order) => [
      `Đơn ${order.code} đã được cửa hàng huỷ. Nếu cần hỗ trợ, hãy liên hệ ${site.contact.email}.`,
      order.paymentStatus === "paid" || order.paymentStatus === "deposit_paid" ? "Số tiền bạn đã trả (kể cả tiền cọc) sẽ được hoàn lại; chúng tôi sẽ báo khi hoàn xong." : "",
    ].filter(Boolean),
  },
  receive_return: {
    subject: (code) => `Đơn ${code} đã huỷ`,
    title: "Đơn hàng đã huỷ",
    lines: (order) => [`Hàng của đơn ${order.code} đã hoàn về cửa hàng nên đơn được huỷ.`],
  },
  refund: {
    subject: (code) => `Đã hoàn tiền đơn ${code}`,
    title: "Đã hoàn tiền",
    lines: (order) => [`Cửa hàng đã hoàn ${formatVnd(order.payments.find((p) => p.kind === "refund")?.amount ?? order.total)} cho đơn ${order.code}.`],
  },
};

export function orderMail(order: Order, event: OrderMailEvent, baseUrl: string) {
  const message = MESSAGES[event];
  if (!message) return null;
  const rows = [
    ...order.items.map((item) => ({
      label: `${item.name}${item.variantName && item.variantName !== "Bản thường" ? ` (${item.variantName})` : ""} × ${item.quantity}`,
      value: formatVnd(item.unitPrice * item.quantity),
    })),
    ...(order.discount > 0 ? [{ label: `Giảm giá${order.couponCode ? ` (${order.couponCode})` : ""}`, value: `−${formatVnd(order.discount)}` }] : []),
    { label: "Phí giao hàng", value: order.shippingFee > 0 ? formatVnd(order.shippingFee) : "Miễn phí" },
    { label: "Tổng cộng", value: formatVnd(order.total), strong: true },
    ...(order.depositAmount > 0 ? [{ label: "Tiền cọc (trả trước)", value: formatVnd(order.depositAmount) }] : []),
  ];
  return {
    subject: message.subject(order.code),
    ...layout({
      title: message.title,
      paragraphs: [`Chào ${order.customerName},`, ...message.lines(order)],
      rows,
      action: { label: "Xem đơn hàng", url: `${baseUrl}/don-hang/${order.token}` },
      footnote: `Giao tới: ${order.customerName}, ${order.shippingAddress}, ${order.shippingCity}.`,
    }),
  };
}

// Gửi thư cho một sự kiện của đơn. Không bao giờ ném lỗi: thư lỗi chỉ được ghi ở hộp thư đi.
export async function notifyOrderEvent(orderId: string, event: OrderMailEvent): Promise<void> {
  try {
    if (!MESSAGES[event]) return;
    const order = await findOrderById(orderId);
    if (!order?.customerEmail) return;
    const mail = orderMail(order, event, await getBaseUrl(site.url));
    if (mail) await sendMail({ to: order.customerEmail, kind: "order", ref: `${order.id}:${event}`, ...mail });
  } catch (error) {
    console.error("[email] Không gửi được thư đơn hàng", orderId, event, error);
  }
}
