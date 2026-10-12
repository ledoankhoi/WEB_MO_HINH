// Dữ liệu danh mục dùng chung cho cả máy chủ và trình duyệt (không import mã chỉ chạy ở máy chủ).

export const CATEGORIES = [
  { slug: "transformers", name: "Transformers", description: "Robot biến hình giữa dạng phương tiện và dạng người máy." },
  { slug: "super-sentai", name: "Super Sentai & Tokusatsu", description: "Siêu robot và nhân vật theo phong cách tokusatsu Nhật Bản." },
  { slug: "robot-hop-the", name: "Robot hợp thể", description: "Những cỗ máy ghép từ nhiều thành phần thành một siêu robot." },
  { slug: "mecha-anime", name: "Mecha & Anime", description: "Mecha và robot bước ra từ thế giới hoạt hình." },
  { slug: "model-kits", name: "Mô hình lắp ráp", description: "Bộ kit tự lắp cho người thích tự tay hoàn thiện mô hình." },
  { slug: "figure", name: "Figure sưu tầm", description: "Figure và mô hình trưng bày dành cho nhà sưu tầm." },
  { slug: "phu-kien", name: "Phụ kiện & linh kiện", description: "Đế trưng bày, linh kiện thay thế và phụ kiện đi kèm." },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export function getCategory(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? null;
}

export function isCategorySlug(value: string): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

// Các kiểu dáng robot dựng bằng hình học trong src/components/three/robots.
export const ROBOT_MODELS = {
  humanoid: "Robot hình người",
  mech: "Mecha hạng nặng",
  companion: "Robot đồng hành",
  drone: "Drone bốn cánh",
  rover: "Xe thám hiểm",
  spider: "Nhện sáu chân",
  hound: "Chó robot",
  arm: "Cánh tay robot",
  orb: "Cầu canh gác",
  retro: "Robot cổ điển",
} as const;

export type RobotModelKey = keyof typeof ROBOT_MODELS;

export function isRobotModelKey(value: string): value is RobotModelKey {
  return Object.hasOwn(ROBOT_MODELS, value);
}

export type RobotColors = {
  primary: string;
  secondary: string;
  accent: string;
};

export type ProductSpec = { label: string; value: string };

export const SORT_OPTIONS = [
  { value: "moi-nhat", label: "Mới nhất" },
  { value: "noi-bat", label: "Nổi bật" },
  { value: "gia-tang", label: "Giá tăng dần" },
  { value: "gia-giam", label: "Giá giảm dần" },
  { value: "ten", label: "Tên A → Z" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export function isSortValue(value: string): value is SortValue {
  return SORT_OPTIONS.some((o) => o.value === value);
}

export const ORDER_STATUSES = ["pending", "confirmed", "shipping", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ",
};

// Các bước chuyển trạng thái hợp lệ của đơn hàng.
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipping", "cancelled"],
  shipping: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(value);
}

export const PAYMENT_METHODS = ["cod", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "Thanh toán khi nhận hàng (COD)",
  bank: "Chuyển khoản ngân hàng",
};

export const PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

// 34 tỉnh, thành phố sau sắp xếp đơn vị hành chính có hiệu lực từ 01/07/2025.
export const PROVINCES = [
  "An Giang",
  "Bắc Ninh",
  "Cà Mau",
  "Cao Bằng",
  "Cần Thơ",
  "Đà Nẵng",
  "Đắk Lắk",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Phòng",
  "Huế",
  "Hưng Yên",
  "Khánh Hòa",
  "Lai Châu",
  "Lạng Sơn",
  "Lào Cai",
  "Lâm Đồng",
  "Nghệ An",
  "Ninh Bình",
  "Phú Thọ",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sơn La",
  "Tây Ninh",
  "Thái Nguyên",
  "Thanh Hóa",
  "TP. Hồ Chí Minh",
  "Tuyên Quang",
  "Vĩnh Long",
] as const;

export function isProvince(value: string): boolean {
  return (PROVINCES as readonly string[]).includes(value);
}
