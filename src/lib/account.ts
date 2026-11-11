// Dữ liệu dùng chung cho trang Cài đặt tài khoản khách (/tai-khoan/cai-dat), cho cả máy chủ và trình duyệt.

export const ADDRESS_LABELS = { home: "Nhà riêng", office: "Văn phòng" } as const;
export type AddressLabel = keyof typeof ADDRESS_LABELS;

export function isAddressLabel(value: string): value is AddressLabel {
  return value in ADDRESS_LABELS;
}

// Số địa chỉ tối đa trong sổ của một tài khoản.
export const MAX_ADDRESSES = 10;

export type Address = {
  id: string;
  label: AddressLabel;
  recipientName: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
};

// Các mục của trang Cài đặt, theo thứ tự trên thanh bên (tham số URL `muc`).
export const SETTINGS_SECTIONS = [
  { slug: "ho-so", label: "Hồ sơ" },
  { slug: "dia-chi", label: "Sổ địa chỉ" },
  { slug: "bao-mat", label: "Tài khoản & Bảo mật" },
  { slug: "thong-bao", label: "Thông báo" },
  { slug: "rieng-tu", label: "Quyền riêng tư" },
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["slug"];

export function isSettingsSection(value: string): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.slug === value);
}

// Chuỗi khách phải gõ lại khi xoá tài khoản, để không xoá nhầm.
export const DELETE_CONFIRM_PHRASE = "XOA TAI KHOAN";
