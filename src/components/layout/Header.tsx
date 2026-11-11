import { Suspense } from "react";
import { IMAGE_SEARCH_MODEL } from "@/lib/image-search";
import { getAddOnProducts, getMegaMenu, getNavigation, getSiteSettings } from "@/server/catalog";
import { getImageSearchStatus } from "@/server/image-search";
import { AccountButton, AccountButtonFallback } from "./AccountButton";
import { CartButton } from "./CartButton";
import { Logo } from "./Logo";
import { MobileCategoryChips, MobileCategoryChipsFallback } from "./MobileCategoryChips";
import { MobileMenu } from "./MobileMenu";
import { MobileTabBar } from "./MobileTabBar";
import { NavLinks, NavLinksFallback, type NavLink } from "./NavLinks";
import { SearchForm } from "./SearchForm";
import { UtilityBar } from "./UtilityBar";
import { AiSearchLink } from "./AiSearchLink";

// Đầu trang của cửa hàng (giao diện "Hộp mô hình"): dải tiện ích, thanh chính (logo, ô tìm kiếm có gợi ý, tài khoản,
// yêu thích, giỏ hàng xem nhanh) và thanh đen (menu đầu trang của quản trị ở /admin/noi-dung/menu, YC-CMS-03).
// Danh mục và bộ lọc nằm ở khối "Tùy chọn sản phẩm" của /san-pham. Trên điện thoại: dải danh mục vuốt ngang và
// thanh điều hướng dưới đáy.
export async function Header() {
  const [navigation, imageSearchStatus, settings, megaMenu, addOns] = await Promise.all([
    getNavigation(),
    // Nút AI (tìm bằng ảnh) chỉ hiện khi đã có sản phẩm tìm được bằng ảnh (YC-AI-01).
    getImageSearchStatus(IMAGE_SEARCH_MODEL.id),
    getSiteSettings(),
    getMegaMenu(),
    getAddOnProducts(),
  ]);
  const links: NavLink[] = navigation.header.map((item) => ({ href: item.url, label: item.label }));
  const imageSearch = imageSearchStatus.products > 0;
  const categories = megaMenu.map(({ slug, name, count }) => ({ slug, name, count }));
  const chips = categories.map(({ slug, name }) => ({ slug, name }));

  return (
    <>
      <UtilityBar settings={settings} imageSearch={imageSearch} />
      <header className="sticky top-0 z-40 bg-surface">
        <div className="border-b-3 border-ink">
          <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 lg:gap-x-7 lg:py-4">
            <MobileMenu links={links} categories={categories} />
            <Logo />
            <SearchForm imageSearch={imageSearch} className="order-last w-full lg:order-none lg:w-auto lg:max-w-[660px] lg:flex-1" />
            <div className="ml-auto flex items-center gap-2.5 lg:gap-3">
              {/* Chỉ phần này phụ thuộc phiên đăng nhập; phần còn lại của đầu trang nằm trong khung tĩnh. Trên điện thoại
                  tài khoản nằm ở thanh điều hướng dưới đáy. */}
              <div className="hidden lg:block">
                <Suspense fallback={<AccountButtonFallback />}>
                  <AccountButton />
                </Suspense>
              </div>
              {imageSearch && <AiSearchLink />}
              <CartButton addOns={addOns} />
            </div>
          </div>
        </div>
        <nav aria-label="Menu chính" className="hidden bg-ink lg:block">
          <div className="relative mx-auto flex max-w-7xl items-center gap-7 px-4 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-7 overflow-x-auto whitespace-nowrap">
              <Suspense fallback={<NavLinksFallback links={links} />}>
                <NavLinks links={links} />
              </Suspense>
            </div>
          </div>
        </nav>
      </header>
      <Suspense fallback={<MobileCategoryChipsFallback categories={chips} />}>
        <MobileCategoryChips categories={chips} />
      </Suspense>
      <Suspense fallback={null}>
        <MobileTabBar imageSearch={imageSearch} />
      </Suspense>
    </>
  );
}
