import Link from "next/link";
import { User } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";

const ICON_BUTTON =
  "grid size-10 place-items-center rounded-full text-fg transition hover:bg-raised hover:text-brand";

// Hiển thị ngay trong khung tĩnh của trang trong lúc chờ đọc phiên đăng nhập.
export function AccountButtonFallback() {
  return (
    <Link href="/tai-khoan" className={ICON_BUTTON} aria-label="Tài khoản">
      <User className="size-5" aria-hidden />
    </Link>
  );
}

// Đọc cookie phiên nên phải đặt dưới <Suspense>.
export async function AccountButton() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/dang-nhap" className={ICON_BUTTON} aria-label="Đăng nhập">
        <User className="size-5" aria-hidden />
      </Link>
    );
  }

  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return (
    <>
      <Link href="/tai-khoan" className={ICON_BUTTON} aria-label={`Tài khoản của ${user.name}`}>
        <span className="grid size-8 place-items-center rounded-full bg-brand/15 text-sm font-bold text-brand">
          {initial}
        </span>
      </Link>
    </>
  );
}
