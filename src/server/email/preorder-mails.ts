import "server-only";
import { site } from "@/config/site";
import { formatDate, formatVnd } from "@/lib/format";
import { amountDue } from "@/lib/preorder";
import { findOrderById } from "../repo/orders";
import { getBaseUrl } from "../request";
import { sendMail } from "./mailer";
import { layout } from "./templates";

// Thư của hàng đặt trước (nghiep-vu-ban-hang mục 10): hàng đã về (đơn đủ hàng sau khi phân bổ) và dời ngày về. Thư giao
// dịch: luôn gửi. Không bao giờ ném lỗi (thư lỗi chỉ ghi ở hộp thư đi).

export type PreorderMailEvent = { kind: "arrived" } | { kind: "delayed"; productName: string; from: number; to: number };

export async function notifyPreorder(orderId: string, event: PreorderMailEvent): Promise<void> {
  try {
    const order = await findOrderById(orderId);
    if (!order?.customerEmail) return;
    const due = amountDue(order);
    const paragraphs =
      event.kind === "arrived"
        ? [
            `Chào ${order.customerName},`,
            `Hàng đặt trước của đơn ${order.code} đã về và được giữ riêng cho bạn. Cửa hàng sẽ đóng gói và giao trong vài ngày tới.`,
            due > 0
              ? `Số tiền còn lại: ${formatVnd(due)}. Bạn trả khi nhận hàng, hoặc trả trước ở trang đơn hàng.`
              : "Đơn đã thanh toán đủ, bạn không phải trả thêm khi nhận hàng.",
          ]
        : [
            `Chào ${order.customerName},`,
            `Nhà cung cấp báo lịch về của “${event.productName}” (đơn ${order.code}) thay đổi: từ khoảng ${formatDate(event.from)} sang khoảng ${formatDate(event.to)}.`,
            "Suất đặt trước và tiền cọc của bạn vẫn được giữ nguyên. Nếu không muốn chờ, hãy liên hệ cửa hàng để huỷ và được hoàn tiền.",
            `Liên hệ: ${site.contact.email}, ${site.contact.phone}.`,
          ];
    const base = await getBaseUrl(site.url);
    const mail = layout({
      title: event.kind === "arrived" ? "Hàng đặt trước đã về" : "Lịch về hàng thay đổi",
      paragraphs,
      action: { label: "Xem đơn hàng", url: `${base}/don-hang/${order.token}` },
    });
    await sendMail({
      to: order.customerEmail,
      kind: "order",
      // Mỗi lần dời ngày là một thư riêng (khoá theo ngày mới).
      ref: event.kind === "arrived" ? `${order.id}:preorder_arrived` : `${order.id}:preorder_delayed:${event.to}`,
      subject: event.kind === "arrived" ? `Hàng đặt trước của đơn ${order.code} đã về` : `Đơn ${order.code}: lịch về hàng thay đổi`,
      ...mail,
    });
  } catch (error) {
    console.error("[email] Không gửi được thư đặt trước", orderId, event.kind, error);
  }
}
