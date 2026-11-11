// Bước xử lý của đơn, gộp từ ba trạng thái độc lập (status, payment_status, shipping_status) thành một nhãn
// duy nhất để nhân viên nhìn là biết đơn đang ở đâu và cần làm gì tiếp. Một bảng dùng cho cả giao diện
// (`orderStage`) và truy vấn (`sql`), nên hai bên không lệch nhau. Các bước loại trừ lẫn nhau.
import { confirmableSql, isConfirmable, type OrderState } from "./order-flow";

// urgent: cửa hàng phải làm ngay; danger: có sự cố; wait: chờ người khác (khách, hãng vận chuyển); done, muted: đã xong.
export type StageTone = "urgent" | "danger" | "wait" | "done" | "muted";

type Stage = {
  label: string;
  tone: StageTone;
  // Việc nhân viên cần làm tiếp (tên nút ở trang đơn).
  next?: string;
  // Điều kiện trên bảng orders (bí danh o) và điều kiện tương đương trong JS.
  sql: string;
  match: (o: OrderState) => boolean;
};

// Thứ tự trong bảng là thứ tự ưu tiên trên danh sách đơn: việc cần làm ngay lên đầu.
export const ORDER_STAGES = {
  "cho-xac-nhan": {
    label: "Đơn mới, chờ xác nhận",
    tone: "urgent",
    next: "Xác nhận đơn",
    sql: `o.status = 'pending' AND ${confirmableSql("o.")}`,
    match: (o) => o.status === "pending" && isConfirmable(o),
  },
  "cho-dong-goi": {
    label: "Đã xác nhận, chờ đóng gói",
    tone: "urgent",
    next: "Bắt đầu đóng gói",
    sql: "o.status = 'confirmed' AND o.preorder_status <> 'waiting'",
    match: (o) => o.status === "confirmed" && o.preorderStatus !== "waiting",
  },
  "dang-dong-goi": {
    label: "Đang đóng gói",
    tone: "urgent",
    next: "Đóng gói xong",
    sql: "o.status = 'processing' AND o.shipping_status = 'not_created'",
    match: (o) => o.status === "processing" && o.shippingStatus === "not_created",
  },
  "cho-ban-giao": {
    label: "Chờ bàn giao vận chuyển",
    tone: "urgent",
    next: "Bàn giao vận chuyển",
    sql: "o.status = 'processing' AND o.shipping_status = 'ready'",
    match: (o) => o.status === "processing" && o.shippingStatus === "ready",
  },
  "giao-that-bai": {
    label: "Giao thất bại",
    tone: "danger",
    next: "Giao lại hoặc nhận hàng hoàn",
    sql: "o.status = 'processing' AND o.shipping_status = 'failed'",
    match: (o) => o.status === "processing" && o.shippingStatus === "failed",
  },
  "cho-thu-tien": {
    label: "Đã giao, chờ thu tiền",
    tone: "urgent",
    next: "Ghi nhận đã thu tiền",
    sql: "o.status = 'processing' AND o.shipping_status = 'delivered' AND o.payment_status IN ('unpaid', 'deposit_paid')",
    match: (o) => o.status === "processing" && o.shippingStatus === "delivered" && (o.paymentStatus === "unpaid" || o.paymentStatus === "deposit_paid"),
  },
  "cho-hoan-tien": {
    label: "Đã huỷ, chờ hoàn tiền",
    tone: "danger",
    next: "Ghi nhận đã hoàn tiền",
    sql: "o.status = 'cancelled' AND o.payment_status IN ('paid', 'deposit_paid')",
    match: (o) => o.status === "cancelled" && (o.paymentStatus === "paid" || o.paymentStatus === "deposit_paid"),
  },
  "cho-chuyen-khoan": {
    label: "Chờ khách thanh toán",
    tone: "wait",
    // Chuyển khoản, tiền cọc đặt trước: kế toán ghi nhận khi thấy tiền; VNPay: tự ghi nhận khi cổng báo (IPN).
    next: "Ghi nhận tiền (cọc hoặc đủ) khi nhận được",
    sql: `o.status = 'pending' AND NOT ${confirmableSql("o.")}`,
    match: (o) => o.status === "pending" && !isConfirmable(o),
  },
  "cho-hang-ve": {
    label: "Chờ hàng đặt trước về",
    tone: "wait",
    // Nhập kho như thường rồi phân bổ ở /admin/dat-truoc: đơn có đủ hàng mới chuyển sang chờ đóng gói.
    next: "Phân bổ hàng khi hàng về",
    sql: "o.status = 'confirmed' AND o.preorder_status = 'waiting'",
    match: (o) => o.status === "confirmed" && o.preorderStatus === "waiting",
  },
  "dang-giao": {
    label: "Đang giao",
    tone: "wait",
    next: "Giao thành công",
    sql: "o.status = 'processing' AND o.shipping_status = 'in_transit'",
    match: (o) => o.status === "processing" && o.shippingStatus === "in_transit",
  },
  "hoan-tat": {
    label: "Hoàn tất",
    tone: "done",
    sql: "o.status = 'completed'",
    match: (o) => o.status === "completed",
  },
  "da-huy": {
    label: "Đã huỷ",
    tone: "muted",
    sql: "o.status = 'cancelled' AND o.payment_status NOT IN ('paid', 'deposit_paid')",
    match: (o) => o.status === "cancelled" && o.paymentStatus !== "paid" && o.paymentStatus !== "deposit_paid",
  },
} as const satisfies Record<string, Stage>;

export type OrderStageKey = keyof typeof ORDER_STAGES;
export const ORDER_STAGE_KEYS = Object.keys(ORDER_STAGES) as OrderStageKey[];
export const isOrderStageKey = (value: unknown): value is OrderStageKey => typeof value === "string" && Object.hasOwn(ORDER_STAGES, value);

// Các bước cửa hàng phải tự làm (đếm ở huy hiệu thanh bên, thẻ "Cần xử lý").
export const ACTION_STAGES = ORDER_STAGE_KEYS.filter((key) => {
  const tone: StageTone = ORDER_STAGES[key].tone;
  return tone === "urgent" || tone === "danger";
});

export function orderStage(order: OrderState): OrderStageKey {
  return ORDER_STAGE_KEYS.find((key) => ORDER_STAGES[key].match(order)) ?? "da-huy";
}

// Biểu thức SQL xếp hạng ưu tiên (0 là cao nhất) theo thứ tự bảng.
export const STAGE_RANK_SQL = `CASE ${ORDER_STAGE_KEYS.map((key, index) => `WHEN ${ORDER_STAGES[key].sql} THEN ${index}`).join(" ")} ELSE ${ORDER_STAGE_KEYS.length} END`;

export const NEEDS_ACTION_SQL = `(${ACTION_STAGES.map((key) => ORDER_STAGES[key].sql).map((sql) => `(${sql})`).join(" OR ")})`;

export const STAGE_TONE_CLASS: Record<StageTone, string> = {
  urgent: "bg-warning/10 text-warning ring-1 ring-warning/30",
  danger: "bg-danger/10 text-danger ring-1 ring-danger/30",
  wait: "bg-brand/10 text-brand-strong ring-1 ring-brand/25",
  done: "bg-success/10 text-success ring-1 ring-success/25",
  muted: "bg-raised text-muted",
};

// Các mốc trên thanh tiến trình ở trang đơn (cả trang quản trị lẫn trang theo dõi đơn của khách).
export const ORDER_STEPS = ["Đặt hàng", "Xác nhận", "Đóng gói", "Bàn giao vận chuyển", "Đã giao", "Hoàn tất"] as const;

// Số mốc đã xong (0–6) và mốc đang có sự cố (nếu có).
export function orderProgress(order: Pick<OrderState, "status" | "shippingStatus">): { done: number; problem: number | null } {
  if (order.status === "completed") return { done: 6, problem: null };
  const shipping = order.shippingStatus;
  const done =
    shipping === "delivered" ? 5
    : shipping === "in_transit" || shipping === "failed" || shipping === "returned" ? 4
    : shipping === "ready" ? 3
    : order.status === "processing" || order.status === "confirmed" ? 2
    : 1;
  // Giao thất bại, hàng hoàn: mốc "Đã giao" có sự cố; huỷ: mốc kế tiếp không đi tiếp được.
  const problem = shipping === "failed" || shipping === "returned" ? 4 : order.status === "cancelled" ? done : null;
  return { done, problem };
}

// Việc nhân viên cần làm tiếp ở bước này, hoặc undefined nếu đơn đã xong.
export function stageNext(key: OrderStageKey): string | undefined {
  const stage: Stage = ORDER_STAGES[key];
  return stage.next;
}
