import Link from "next/link";
import { site } from "@/config/site";

// Biểu tượng đầu robot, dùng chung với src/app/icon.svg.
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#191a1c" />
      <path d="M16 4.5v4" stroke="#00a6c7" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="4.5" r="1.8" fill="#00a6c7" />
      <rect x="6" y="9" width="20" height="16" rx="5" fill="#fafaf8" />
      <rect x="9" y="13" width="14" height="7" rx="3.5" fill="#191a1c" />
      <circle cx="13" cy="16.5" r="1.7" fill="#00a6c7" />
      <circle cx="19" cy="16.5" r="1.7" fill="#00a6c7" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={`${site.name}, về trang chủ`}>
      <LogoMark />
      <span className="text-lg font-bold tracking-[0.18em] text-fg">{site.name}</span>
    </Link>
  );
}
