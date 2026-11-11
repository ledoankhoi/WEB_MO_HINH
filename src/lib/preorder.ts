// Hàng sắp về và đặt trước (docs/ke-hoach/nghiep-vu-ban-hang.md mục 10). Dùng chung cho máy chủ và trình duyệt.
//
// Một "đợt đặt trước" (bảng preorder_offers) gắn với một phiên bản: ngày dự kiến về, % cọc, số suất. Khi đợt chưa kết
// thúc, phiên bản chỉ bán dạng đặt trước (không bán thường), để hàng về được chia cho người đã đặt trước trước. Dòng đơn
// đặt trước không giữ tồn kho (kho chưa có hàng), chỉ chiếm suất; hàng về thì nhân viên phân bổ: giữ hàng cho từng đơn
// theo thứ tự đặt. Đơn còn dòng chưa phân bổ ở trạng thái "chờ hàng về" và chưa đóng gói được (L4).

export const OFFER_STATUSES = ["open", "closed", "ended"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  open: "Đang nhận đặt",
  closed: "Ngừng nhận đặt",
  ended: "Đã kết thúc",
};

export const isOfferStatus = (value: unknown): value is OfferStatus => typeof value === "string" && (OFFER_STATUSES as readonly string[]).includes(value);

// Đợt đặt trước đang chạy của một phiên bản, như khách thấy. `left`: số suất còn lại, null nếu không giới hạn.
export type PreorderOffer = {
  id: string;
  status: "open" | "closed";
  expectedAt: number;
  depositPercent: number;
  left: number | null;
  note: string;
};

// Trạng thái đặt trước của cả đơn (cột orders.preorder_status).
export const ORDER_PREORDER_STATUSES = ["none", "waiting", "ready"] as const;
export type OrderPreorderStatus = (typeof ORDER_PREORDER_STATUSES)[number];

export const ORDER_PREORDER_LABELS: Record<OrderPreorderStatus, string> = {
  none: "Không có hàng đặt trước",
  waiting: "Chờ hàng đặt trước về",
  ready: "Hàng đặt trước đã về",
};

export const isOrderPreorderStatus = (value: unknown): value is OrderPreorderStatus =>
  typeof value === "string" && (ORDER_PREORDER_STATUSES as readonly string[]).includes(value);

// Khách chọn khi đơn có hàng đặt trước cần cọc: chỉ trả tiền cọc trước, hay trả đủ ngay.
export type PaymentPlan = "deposit" | "full";
export const isPaymentPlan = (value: unknown): value is PaymentPlan => value === "deposit" || value === "full";

// Giới hạn % cọc nhân viên đặt được. 0: không cần cọc (đặt chỗ, trả khi nhận); 100: phải trả đủ trước.
export const DEPOSIT_PERCENT_MIN = 0;
export const DEPOSIT_PERCENT_MAX = 100;

// Đọc cột JSON `preorder` do máy chủ dựng (preorderJson trong src/server/repo/products.ts). Sai định dạng thì coi như không có.
export function parsePreorder(value: unknown): PreorderOffer | null {
  if (value === null || value === undefined || value === "") return null;
  let data: unknown = value;
  if (typeof value === "string") {
    try {
      data = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const raw = data as { id?: unknown; status?: unknown; expectedAt?: unknown; depositPercent?: unknown; maxQty?: unknown; taken?: unknown; note?: unknown };
  if (typeof raw?.id !== "string" || (raw.status !== "open" && raw.status !== "closed")) return null;
  const maxQty = raw.maxQty === null || raw.maxQty === undefined ? null : Number(raw.maxQty);
  return {
    id: raw.id,
    status: raw.status,
    expectedAt: Number(raw.expectedAt),
    depositPercent: Number(raw.depositPercent),
    left: maxQty === null ? null : Math.max(0, maxQty - Number(raw.taken ?? 0)),
    note: typeof raw.note === "string" ? raw.note : "",
  };
}

// Còn nhận đặt trước không (đợt đang mở và còn suất).
export function canPreorder(preorder: PreorderOffer | null): boolean {
  return preorder !== null && preorder.status === "open" && (preorder.left === null || preorder.left > 0);
}

// Số lượng tối đa khách đặt được lúc này: hàng đặt trước tính theo suất còn lại, hàng thường theo tồn kho.
export function orderableQty(stock: number, preorder: PreorderOffer | null, maxPerItem: number): number {
  if (preorder) return canPreorder(preorder) ? Math.min(maxPerItem, preorder.left ?? maxPerItem) : 0;
  return Math.max(0, Math.min(maxPerItem, Math.floor(stock)));
}

// Tiền cọc của một dòng: đơn giá × số lượng × % cọc, làm tròn lên tới nghìn đồng.
export function lineDeposit(unitPrice: number, quantity: number, depositPercent: number): number {
  if (depositPercent <= 0) return 0;
  return Math.ceil((unitPrice * quantity * Math.min(depositPercent, 100)) / 100 / 1000) * 1000;
}

// Tiền cọc của cả đơn theo lựa chọn của khách. Cọc từ tổng đơn trở lên (cọc 100%, đơn chỉ có hàng đặt trước, giảm giá
// lớn) thì không còn là cọc: khách phải trả đủ, trả về 0.
export function orderDeposit(deposit: number, total: number, plan: PaymentPlan): number {
  return plan === "deposit" && deposit > 0 && deposit < total ? deposit : 0;
}

// Số tiền khách cần trả ở lần thanh toán kế tiếp (chuyển khoản, VNPay): tiền cọc nếu đơn có cọc mà chưa nhận, phần còn
// lại nếu đã nhận cọc, cả đơn nếu không cọc; 0 khi đã trả xong.
export function amountDue(order: { total: number; depositAmount: number; paymentStatus: string }): number {
  if (order.paymentStatus === "unpaid") return order.depositAmount > 0 ? order.depositAmount : order.total;
  if (order.paymentStatus === "deposit_paid") return order.total - order.depositAmount;
  return 0;
}

// Khách còn trả online được không (VNPay, chuyển khoản): đơn chưa trả còn chờ xác nhận, hoặc đã cọc và hàng chưa giao xong
// (trả phần còn lại trước khi nhận thay vì trả khi nhận).
export function onlinePayable(order: { status: string; paymentStatus: string; shippingStatus: string }): boolean {
  if (order.paymentStatus === "unpaid") return order.status === "pending";
  return (
    order.paymentStatus === "deposit_paid" &&
    (order.status === "pending" || order.status === "confirmed" || order.status === "processing") &&
    (order.shippingStatus === "not_created" || order.shippingStatus === "ready" || order.shippingStatus === "in_transit")
  );
}
