import Link from "next/link";
import { site } from "@/config/site";
import { CATEGORIES } from "@/lib/catalog";
import { getNavigation, getSiteSettings } from "@/server/catalog";
import { LogoMark } from "./Logo";

const linkClass = "text-sm text-muted transition hover:text-fg";

export async function Footer() {
  const [{ footer }, settings] = await Promise.all([getNavigation(), getSiteSettings()]);
  // Chỉ hiện liên hệ khi quản trị đã nhập thông tin thật (docs/chuan/01 mục 6), không hiện nội dung mẫu.
  const contact = settings.contact;
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-lg font-bold tracking-[0.18em]">{site.name}</span>
          </div>
          <p className="max-w-sm text-sm text-muted">{site.description}</p>
        </div>
        <nav aria-label="Danh mục" className="space-y-2.5">
          <h2 className="text-sm font-semibold">Danh mục</h2>
          {CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/san-pham?loai=${category.slug}`} className={`block ${linkClass}`}>
              {category.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Hỗ trợ" className="space-y-2.5">
          <h2 className="text-sm font-semibold">Hỗ trợ</h2>
          {footer.map((item) => (
            <Link key={item.id} href={item.url} className={`block ${linkClass}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        {contact && (
          <address className="space-y-1.5 text-sm text-muted not-italic">
            <h2 className="text-sm font-semibold text-fg">Liên hệ</h2>
            {contact.phone && <p>Điện thoại: {contact.phone}</p>}
            {contact.email && <p>Email: {contact.email}</p>}
            {contact.address && <p>{contact.address}</p>}
            {contact.hours && <p>{contact.hours}</p>}
          </address>
        )}
      </div>
      <p className="border-t border-line px-4 py-5 text-center text-xs text-muted">
        Bản dùng thử: sản phẩm, giá và tồn kho trên trang là dữ liệu minh hoạ, không phải hàng chính hãng của bất kỳ
        thương hiệu nào.
      </p>
    </footer>
  );
}
