// Vai trò và quyền theo mục 3 của docs/chuan/10-quan-tri-va-kho.md. Đây là bảng duy nhất mà máy chủ
// dùng để kiểm tra quyền; giao diện chỉ dựa vào nó để ẩn những gì không dùng được.
export const ROLES = [
  "customer",
  "admin",
  "product_manager",
  "warehouse_manager",
  "warehouse",
  "order_staff",
  "support",
  "marketing",
  "accountant",
  "viewer",
] as const;

export type Role = (typeof ROLES)[number];
export type StaffRole = Exclude<Role, "customer">;

export const ROLE_LABELS: Record<Role, string> = {
  customer: "Khách hàng",
  admin: "Quản trị viên",
  product_manager: "Quản lý sản phẩm",
  warehouse_manager: "Quản lý kho",
  warehouse: "Nhân viên kho",
  order_staff: "Nhân viên đơn hàng",
  support: "Chăm sóc khách hàng",
  marketing: "Marketing và nội dung",
  accountant: "Kế toán",
  viewer: "Chỉ xem",
};

const ALL_STAFF = ROLES.filter((role): role is StaffRole => role !== "customer");

// `admin` có mọi quyền nên không ghi lại ở từng dòng.
const MATRIX = {
  "dashboard.view": ALL_STAFF,
  "catalog.view": ALL_STAFF,
  "catalog.edit": ["product_manager"],
  "cost.view": ["warehouse_manager", "accountant"],
  "inventory.view": ["product_manager", "warehouse_manager", "warehouse", "order_staff", "accountant", "viewer"],
  "inventory.draft": ["warehouse_manager", "warehouse"],
  "inventory.post": ["warehouse_manager"],
  "inventory.setup": ["warehouse_manager"],
  "orders.view": ["warehouse_manager", "warehouse", "order_staff", "support", "accountant", "viewer"],
  "orders.process": ["order_staff"],
  "orders.fulfil": ["warehouse_manager", "warehouse", "order_staff"],
  "payments.manage": ["accountant"],
  "customers.view": ["order_staff", "support", "accountant"],
  "customers.manage": ["support"],
  "reviews.moderate": ["support"],
  "content.edit": ["marketing"],
  "coupons.manage": ["marketing"],
  "reports.view": ["product_manager", "warehouse_manager", "marketing", "accountant", "viewer"],
  "staff.manage": [],
  "audit.view": ["accountant", "viewer"],
} satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof MATRIX;
export const PERMISSIONS = Object.keys(MATRIX) as Permission[];

export const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);
export const isStaffRole = (value: unknown): value is StaffRole => isRole(value) && value !== "customer";

export function can(role: Role, permission: Permission): boolean {
  return role === "admin" || (MATRIX[permission] as readonly Role[]).includes(role);
}
