type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonStyleProps = { variant?: Variant; size?: Size; full?: boolean };

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:brightness-95",
  secondary: "border border-line bg-raised text-fg hover:border-fg/30",
  ghost: "text-fg hover:bg-raised",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-7 text-base",
};

// Lớp `btn btn-<kiểu> btn-<cỡ>` để giao diện cửa hàng (.store-skin trong globals.css) đổi dáng nút; khu quản trị
// không có lớp đó nên giữ nút tròn. File không có "use client" để Server Component gọi được.
export function buttonClass({ variant = "primary", size = "md", full = false }: ButtonStyleProps = {}): string {
  return [
    `btn btn-${variant} btn-${size}`,
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full ? "w-full" : "",
  ].join(" ");
}
