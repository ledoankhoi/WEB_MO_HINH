import Link from "next/link";
import type { Banner } from "@/server/repo/content";

// Banner trang chủ (YC-CMS-02). Dùng chung cho cửa hàng và bản xem trước trong quản trị (Q20).
function BannerLink({ banner, children }: { banner: Banner; children: React.ReactNode }) {
  if (!banner.linkUrl) return <>{children}</>;
  if (banner.linkUrl.startsWith("/")) return <Link href={banner.linkUrl}>{children}</Link>;
  return (
    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function BannerImage({ banner, className }: { banner: Banner; className: string }) {
  return (
    <picture>
      {banner.imageMobileUrl && <source media="(max-width: 639px)" srcSet={banner.imageMobileUrl} />}
      {/* Ảnh banner lấy từ kho media do quản trị tải lên, kích thước tuỳ chiến dịch nên không qua next/image. */}
      <img src={banner.imageUrl} alt={banner.title} className={className} />
    </picture>
  );
}

export function HeroBanner({ banner }: { banner: Banner }) {
  return (
    <BannerLink banner={banner}>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-raised">
        <BannerImage banner={banner} className="aspect-[3/1] w-full object-cover sm:aspect-[4/1]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 text-white sm:p-6">
          <p className="text-lg font-bold sm:text-2xl">{banner.title}</p>
          {banner.subtitle && <p className="text-sm opacity-90 sm:text-base">{banner.subtitle}</p>}
        </div>
      </div>
    </BannerLink>
  );
}

export function StripBanners({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {banners.map((banner) => (
        <li key={banner.id}>
          <BannerLink banner={banner}>
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <BannerImage banner={banner} className="aspect-[2/1] w-full object-cover" />
              <div className="p-3">
                <p className="font-semibold">{banner.title}</p>
                {banner.subtitle && <p className="text-sm text-muted">{banner.subtitle}</p>}
              </div>
            </div>
          </BannerLink>
        </li>
      ))}
    </ul>
  );
}
