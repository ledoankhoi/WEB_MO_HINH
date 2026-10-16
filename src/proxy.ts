import { NextResponse, type NextRequest } from "next/server";

// Khu quản trị chỉ mở trên tên miền riêng (mặc định admin.localhost, Chrome và Edge tự trỏ về máy này);
// tên miền cửa hàng không có /admin. Khi đưa lên mạng đặt ADMIN_HOST, ví dụ admin.robotica.vn.
const ADMIN_HOST = (process.env.ADMIN_HOST?.trim() || "admin.localhost").toLowerCase();

// Đường dẫn không có trang nào: Next.js vẽ trang 404 chung (src/app/not-found.tsx).
const notFound = (request: NextRequest) => NextResponse.rewrite(new URL("/__khong-co-trang", request.url));

// YC-SP-09: slug cũ của sản phẩm chuyển hướng 308. Làm ở đây vì trang sản phẩm dựng trong Suspense,
// chuyển hướng từ trong trang chỉ ra được thẻ meta chứ không ra mã 308.
const PRODUCT_PATH = /^\/san-pham\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  if (host !== ADMIN_HOST) {
    if (isAdminPath) return notFound(request);
    const product = PRODUCT_PATH.exec(pathname);
    if (product) {
      const { findSlugRedirect } = await import("@/server/slug-redirects");
      const target = await findSlugRedirect(product[1]);
      if (target) {
        const url = request.nextUrl.clone();
        url.pathname = `/san-pham/${target}`;
        return NextResponse.redirect(url, 308);
      }
    }
    return NextResponse.next();
  }
  if (isAdminPath || pathname.startsWith("/media/")) return NextResponse.next();
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }
  return notFound(request);
}

export const config = {
  // Bỏ qua tài nguyên tĩnh của Next.js và file có phần mở rộng (ảnh, favicon...).
  matcher: ["/((?!_next/|.*\\.[A-Za-z0-9]+$).*)"],
};
