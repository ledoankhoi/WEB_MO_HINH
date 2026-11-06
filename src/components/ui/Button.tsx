import type { ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { Button as PressMotion } from "@animate-ui/react/primitives/buttons/button";
import { buttonClass, type ButtonStyleProps } from "./button-style";

export { buttonClass } from "./button-style";
export { ButtonLink } from "./ButtonLink";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps & { pending?: boolean };

// Nút co nhẹ khi bấm (Animate UI Button, tự tắt khi người dùng bật "giảm chuyển động").
export function Button({ variant, size, full, pending = false, className = "", children, disabled, ...props }: ButtonProps) {
  return (
    <PressMotion asChild>
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
    </PressMotion>
  );
}
