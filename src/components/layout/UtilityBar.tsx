import Link from "next/link";
import { site } from "@/config/site";
import { formatVnd } from "@/lib/format";
import type { SiteSettings } from "@/server/repo/content";

const LINK = "transition hover:underline";

// Dải xanh coban trên cùng: cam kết của cửa hàng và lối tắt tra cứu đơn, tìm bằng ảnh, hotline. Số ngày đổi trả,
// bảo hành lấy theo cài đặt hiển thị của quản trị (mặc định ở src/config/site.ts). Hotline chỉ hiện khi quản trị đã
// nhập số thật.
export function UtilityBar({ settings, imageSearch }: { settings: SiteSettings; imageSearch: boolean }) {
  const policy = settings.policy ?? site.policy;
  const phone = settings.contact?.phone;
  const square = <span aria-hidden className="size-1.5 shrink-0 bg-white" />;
  return (
    <div className="bg-cobalt font-condensed text-[15px] font-bold tracking-[0.06em] text-white uppercase">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2 sm:px-6">
        <p className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <span>Miễn phí giao từ {formatVnd(site.shipping.freeFrom)}</span>
          <span className="hidden items-center gap-3.5 sm:flex">
            {square}
            Đổi trả {policy.returnDays} ngày
            {square}
            Bảo hành {policy.warrantyMonths} tháng
          </span>
        </p>
        <nav aria-label="Tiện ích" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/tra-cuu-don-hang" className={LINK}>
            Tra cứu đơn
          </Link>
          {imageSearch && (
            <Link href="/tim-bang-anh" className={`${LINK} hidden sm:inline`}>
              Tìm bằng ảnh
            </Link>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={LINK}>
              Hotline {phone}
            </a>
          )}
        </nav>
      </div>
    </div>
  );
}
