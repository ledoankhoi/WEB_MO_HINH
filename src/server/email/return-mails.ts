import "server-only";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import { RETURN_REASONS } from "@/lib/returns";
import { findReturnRequest, type ReturnRequest } from "../repo/returns";
import { getBaseUrl } from "../request";
import { sendMail } from "./mailer";
import { layout } from "./templates";

// Thư báo yêu cầu trả hàng (nghiep-vu-ban-hang mục 4). Thư giao dịch: luôn gửi. Không bao giờ ném lỗi.

export type ReturnMailEvent = "requested" | "approved" | "rejected" | "refunded";

const MESSAGES: Record<ReturnMailEvent, { subject: (code: string) => string; title: string; lines: (request: ReturnRequest) => string[] }> = {
  requested: {
    subject: (code) => `Đã nhận yêu cầu trả hàng ${code}`,
    title: "Đã nhận yêu cầu trả hàng",
    lines: (request) => [
      `Cửa hàng đã nhận yêu cầu trả hàng ${request.code} của đơn ${request.orderCode} (lý do: ${RETURN_REASONS[request.reason].label}).`,
      "Nhân viên sẽ xem xét và trả lời trong 1–2 ngày làm việc. Vui lòng giữ nguyên hàng và hộp cho tới khi có kết quả.",
    ],
  },
  approved: {
    subject: (code) => `Yêu cầu trả hàng ${code} đã được duyệt`,
    title: "Yêu cầu trả hàng đã được duyệt",
    lines: (request) => [
      `Yêu cầu ${request.code} đã được chấp nhận. Số tiền sẽ hoàn: ${formatVnd(request.refundAmount)}.`,
      `Vui lòng đóng gói hàng kèm phụ kiện, ghi mã ${request.code} ngoài hộp và gửi về: ${site.contact.address}.`,
      "Cửa hàng hoàn tiền sau khi nhận và kiểm tra hàng.",
      ...(request.staffNote ? [`Ghi chú của cửa hàng: ${request.staffNote}`] : []),
    ],
  },
  rejected: {
    subject: (code) => `Yêu cầu trả hàng ${code} chưa được chấp nhận`,
    title: "Yêu cầu trả hàng chưa được chấp nhận",
    lines: (request) => [
      `Rất tiếc, yêu cầu ${request.code} của đơn ${request.orderCode} chưa được chấp nhận.`,
      ...(request.staffNote ? [`Lý do: ${request.staffNote}`] : []),
      `Nếu cần hỗ trợ thêm, hãy liên hệ ${site.contact.email} hoặc ${site.contact.phone}.`,
    ],
  },
  refunded: {
    subject: (code) => `Đã hoàn tiền cho yêu cầu ${code}`,
    title: "Đã hoàn tiền",
    lines: (request) => [`Cửa hàng đã nhận lại hàng và hoàn ${formatVnd(request.refundAmount)} cho yêu cầu ${request.code} (đơn ${request.orderCode}).`],
  },
};

export function returnMail(request: ReturnRequest, event: ReturnMailEvent, baseUrl: string) {
  const message = MESSAGES[event];
  return {
    subject: message.subject(request.code),
    ...layout({
      title: message.title,
      paragraphs: [`Chào ${request.customerName},`, ...message.lines(request)],
      rows: request.items.map((item) => ({ label: `${item.name} × ${item.quantity}`, value: formatVnd(item.unitPrice * item.quantity) })),
      action: { label: "Xem đơn hàng", url: `${baseUrl}/don-hang/${request.orderToken}` },
    }),
  };
}

export async function notifyReturnEvent(requestId: string, event: ReturnMailEvent): Promise<void> {
  try {
    const request = await findReturnRequest(requestId);
    if (!request?.customerEmail) return;
    const mail = returnMail(request, event, await getBaseUrl(site.url));
    await sendMail({ to: request.customerEmail, kind: "return", ref: `${request.id}:${event}`, ...mail });
  } catch (error) {
    console.error("[email] Không gửi được thư trả hàng", requestId, event, error);
  }
}
