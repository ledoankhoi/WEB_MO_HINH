import type { Permission } from "./permissions";

// Thông báo của khu quản trị: các việc đang chờ nhân viên xử lý. Mỗi loại chỉ gửi cho vai trò có quyền làm việc đó
// (ma trận ở src/lib/permissions.ts); máy chủ lọc trước khi trả, trình duyệt chỉ hiển thị.
//   href: trang mở ra khi bấm thông báo (đã lọc sẵn).
//   nav: mục thanh bên gắn huy hiệu số; bỏ trống khi số đã nằm trong huy hiệu của loại khác (tránh đếm hai lần).
//   tone: urgent (đỏ) là việc phải làm; warn (vàng) là việc nên xem.
//   within: số này đã nằm trong số của loại kia (đơn chờ hoàn tiền, đơn đang đóng gói là đơn cần xử lý), nên tổng
//   trên nút chuông không cộng lại khi người xem thấy cả hai.
export const ALERT_KINDS = {
  orders: {
    label: "Đơn hàng cần xử lý",
    href: "/admin/don-hang",
    nav: "/admin/don-hang",
    permission: "orders.view",
    tone: "urgent",
  },
  overdueTransfers: {
    label: "Đơn chuyển khoản quá 48 giờ chưa thanh toán",
    href: "/admin/don-hang?trang-thai=pending&phuong-thuc=bank&thanh-toan=unpaid",
    nav: null,
    permission: "orders.process",
    tone: "warn",
  },
  refunds: {
    label: "Đơn huỷ chờ hoàn tiền",
    href: "/admin/don-hang/cho-hoan-tien",
    nav: "/admin/don-hang/cho-hoan-tien",
    permission: "payments.manage",
    tone: "urgent",
    within: "orders",
  },
  returns: {
    label: "Yêu cầu trả hàng chờ duyệt",
    href: "/admin/don-hang/tra-hang?trang-thai=requested",
    nav: "/admin/don-hang/tra-hang",
    permission: "orders.process",
    tone: "urgent",
  },
  returnRefunds: {
    label: "Hàng trả đã về, chờ hoàn tiền",
    href: "/admin/don-hang/tra-hang?trang-thai=approved",
    nav: null,
    permission: "payments.manage",
    tone: "urgent",
  },
  toPack: {
    label: "Đơn chờ lấy hàng, đóng gói",
    href: "/admin/kho/lay-hang",
    nav: "/admin/kho/lay-hang",
    permission: "orders.fulfil",
    tone: "urgent",
    within: "orders",
  },
  preorderArrived: {
    label: "Hàng đặt trước đã về, chờ phân bổ cho khách",
    href: "/admin/dat-truoc",
    nav: "/admin/dat-truoc",
    permission: "orders.fulfil",
    tone: "urgent",
  },
  submittedDocs: {
    label: "Phiếu kho chờ ghi sổ",
    href: "/admin/kho/phieu?trang-thai=submitted",
    nav: "/admin/kho/phieu",
    permission: "inventory.post",
    tone: "urgent",
  },
  quarantine: {
    label: "Hàng cách ly chờ kiểm tra",
    href: "/admin/kho/cach-ly",
    nav: "/admin/kho/cach-ly",
    permission: "inventory.draft",
    tone: "warn",
  },
  restocked: {
    label: "Khách chờ hàng: mẫu đã có hàng lại",
    href: "/admin/khach-hang/cho-hang",
    nav: "/admin/khach-hang/cho-hang",
    permission: "customers.manage",
    tone: "warn",
  },
  reviews: {
    label: "Đánh giá chờ duyệt",
    href: "/admin/danh-gia?trang-thai=pending",
    nav: "/admin/danh-gia",
    permission: "reviews.moderate",
    tone: "urgent",
  },
  chat: {
    label: "Tin nhắn khách chờ trả lời",
    href: "/admin/chat",
    nav: "/admin/chat",
    permission: "customers.manage",
    tone: "urgent",
  },
  questions: {
    label: "Câu hỏi sản phẩm cần xử lý",
    href: "/admin/hoi-dap",
    nav: "/admin/hoi-dap",
    permission: "reviews.moderate",
    tone: "urgent",
  },
  posts: {
    label: "Bài cộng đồng chờ duyệt",
    href: "/admin/cong-dong",
    nav: "/admin/cong-dong",
    permission: "community.moderate",
    tone: "urgent",
  },
  reports: {
    label: "Bài cộng đồng bị báo cáo",
    href: "/admin/cong-dong?tab=reported",
    nav: "/admin/cong-dong",
    permission: "community.moderate",
    tone: "urgent",
  },
  banners: {
    label: "Banner hết lịch trong 3 ngày",
    href: "/admin/noi-dung/banner",
    nav: "/admin/noi-dung/banner",
    permission: "content.edit",
    tone: "warn",
  },
} as const satisfies Record<
  string,
  {
    label: string;
    href: string;
    nav: string | null;
    permission: Permission;
    tone: "urgent" | "warn";
    within?: string;
  }
>;

export type AlertKey = keyof typeof ALERT_KINDS;
export const ALERT_KEYS = Object.keys(ALERT_KINDS) as AlertKey[];

// Việc mới phát sinh (đơn mới, bài mới, đánh giá mới): trình duyệt hiện thông báo nổi một lần cho mỗi việc.
export type AlertEvent = {
  kind: "orders" | "posts" | "reviews" | "chat";
  id: string;
  at: number;
  text: string;
  href: string;
};

export type AdminAlerts = {
  // Chỉ các loại người xem có quyền, kể cả loại đang là 0 (để biết khi nào số đổi).
  counts: Partial<Record<AlertKey, number>>;
  events: AlertEvent[];
};

export function alertTotal(alerts: AdminAlerts): number {
  let total = 0;
  for (const key of ALERT_KEYS) {
    const kind = ALERT_KINDS[key];
    if ("within" in kind && alerts.counts[kind.within] !== undefined) continue;
    total += alerts.counts[key] ?? 0;
  }
  return total;
}
