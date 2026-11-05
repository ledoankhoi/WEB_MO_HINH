import Link from "next/link";
import { AnimateIcon, User } from "@/components/animate/icons";
import { getCurrentUser } from "@/server/auth/session";

const SQUARE =
  "grid size-[52px] place-items-center border-3 border-ink bg-surface shadow-[4px_4px_0_var(--color-ink)] transition hover:bg-raised";

// Hiển thị ngay trong khung tĩnh của trang trong lúc chờ đọc phiên đăng nhập.
export function AccountButtonFallback() {
  return (
    <Link href="/tai-khoan" className={SQUARE} aria-label="Tài khoản">
      <User className="size-[22px]" aria-hidden />
    </Link>
  );
}

// Đọc cookie phiên nên phải đặt dưới <Suspense>.
export async function AccountButton() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <AnimateIcon animateOnHover asChild>
        <Link href="/dang-nhap" className={SQUARE} aria-label="Đăng nhập">
          <User className="size-[22px]" aria-hidden />
        </Link>
      </AnimateIcon>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <Link href="/tai-khoan" className={SQUARE} aria-label={`Tài khoản của ${user.name}`}>
      <span className="grid size-8 place-items-center bg-cobalt font-condensed text-lg font-black text-white">{initial}</span>
    </Link>
  );
}
