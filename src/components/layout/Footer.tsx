import Link from "next/link";
import { site } from "@/config/site";
import { CATEGORIES } from "@/lib/catalog";
import { LogoMark } from "./Logo";

const linkClass = "text-sm text-muted transition hover:text-fg";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
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
          <Link href="/tra-cuu-don-hang" className={`block ${linkClass}`}>
            Tra cứu đơn hàng
          </Link>
          <Link href="/gio-hang" className={`block ${linkClass}`}>
            Giỏ hàng
          </Link>
          <Link href="/tai-khoan" className={`block ${linkClass}`}>
            Tài khoản
          </Link>
        </nav>
      </div>
      <p className="border-t border-line px-4 py-5 text-center text-xs text-muted">
        Bản dùng thử: sản phẩm, giá và tồn kho trên trang là dữ liệu minh hoạ, không phải hàng chính hãng của bất kỳ
        thương hiệu nào.
      </p>
    </footer>
  );
}
