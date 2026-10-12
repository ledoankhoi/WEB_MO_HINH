import type { ButtonHTMLAttributes, ComponentProps } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type StyleProps = { variant?: Variant; size?: Size; full?: boolean };

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

export function buttonClass({ variant = "primary", size = "md", full = false }: StyleProps = {}): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition",
    "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    full ? "w-full" : "",
  ].join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps & { pending?: boolean };

export function Button({ variant, size, full, pending = false, className = "", children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${buttonClass({ variant, size, full })} ${className}`}
    >
      {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant, size, full, className = "", ...props }: ComponentProps<typeof Link> & StyleProps) {
  return <Link {...props} className={`${buttonClass({ variant, size, full })} ${className}`} />;
}
