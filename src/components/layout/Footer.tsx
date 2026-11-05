import Link from "next/link";
import { site } from "@/config/site";
import { getMegaMenu, getNavigation, getSiteSettings } from "@/server/catalog";
import { getBankAccount } from "@/server/payment";

const HEADING = "mb-1 font-condensed text-xl font-extrabold uppercase";
const LINK = "text-[15px] text-muted transition hover:text-fg hover:underline";

// Chân trang (giao diện "Hộp mô hình"): danh mục đang có hàng, menu chân trang của quản trị, liên hệ (chỉ hiện khi
// quản trị đã nhập thông tin thật, docs/chuan/01 mục 6) và tên cửa hàng chữ viền cỡ lớn.
export async function Footer() {
  const [{ footer }, settings, categories] = await Promise.all([getNavigation(), getSiteSettings(), getMegaMenu()]);
  const contact = settings.contact;
  const payment = getBankAccount() ? "Thanh toán: chuyển khoản VietQR, tiền mặt khi nhận hàng" : "Thanh toán: tiền mặt khi nhận hàng (COD)";

  return (
    <footer className="mt-24 overflow-hidden border-t-3 border-ink bg-surface">
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <p className="max-w-sm text-[15px] leading-relaxed text-muted">{site.description}</p>
          <nav aria-labelledby="footer-danh-muc" className="flex flex-col gap-2.5">
            <h2 id="footer-danh-muc" className={HEADING}>
              Danh mục
            </h2>
            {categories.map((category) => (
              <Link key={category.slug} href={`/san-pham?loai=${category.slug}`} className={LINK}>
                {category.name}
              </Link>
            ))}
          </nav>
          <nav aria-labelledby="footer-ho-tro" className="flex flex-col gap-2.5">
            <h2 id="footer-ho-tro" className={HEADING}>
              Hỗ trợ
            </h2>
            {footer.map((item) => (
              <Link key={item.id} href={item.url} className={LINK}>
                {item.label}
              </Link>
            ))}
          </nav>
          {contact && (
            <address className="flex flex-col gap-2.5 text-[15px] text-muted not-italic">
              <h2 className={`${HEADING} text-fg`}>Liên hệ</h2>
              {contact.phone && <p>Hotline {contact.phone}</p>}
              {contact.email && <p>Email {contact.email}</p>}
              {contact.address && <p>{contact.address}</p>}
              {contact.hours && <p>Mở cửa {contact.hours}</p>}
            </address>
          )}
        </div>
        <div className="mt-10 flex flex-wrap justify-between gap-x-6 gap-y-2 border-t-3 border-ink py-4 text-sm text-muted">
          <span>© {site.name}</span>
          <span>{payment}</span>
        </div>
        <p className="pb-2 text-xs text-muted">
          Bản dùng thử: sản phẩm, giá và tồn kho trên trang là dữ liệu minh hoạ, không phải hàng chính hãng của bất kỳ thương hiệu nào.
        </p>
        <p aria-hidden className="outline-text -mb-[0.14em] font-condensed text-[clamp(4.5rem,15.5vw,12.5rem)] leading-none font-black whitespace-nowrap italic select-none">
          {site.name}
        </p>
      </div>
    </footer>
  );
}
