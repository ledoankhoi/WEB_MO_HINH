import type { MetadataRoute } from "next";
import { site } from "@/config/site";

// robots.txt (nghiep-vu-ban-hang mục 20): cho phép trang cửa hàng, chặn quản trị, API và các trang riêng của khách (giỏ,
// thanh toán, tài khoản, đơn hàng có token).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/gio-hang", "/thanh-toan", "/tai-khoan", "/don-hang/", "/tra-cuu-don-hang", "/xac-thuc-email", "/dat-lai-mat-khau", "/so-sanh"],
    },
    sitemap: `${site.url}/sitemap.xml`,
  };
}
