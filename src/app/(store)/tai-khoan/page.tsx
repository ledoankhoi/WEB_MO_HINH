import { Suspense } from "react";
import { RecentlyViewed } from "@/components/product/RecentlyViewed";
import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { LogoutButton } from "@/components/account/AccountForms";
import { ReviewForm } from "@/components/account/ReviewForm";
import { ProductGrid } from "@/components/product/ProductCard";
import { ButtonLink } from "@/components/ui/Button";
import { ORDER_STATUS_LABELS } from "@/lib/catalog";
import { formatDate, formatVnd } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listOrdersByUser } from "@/server/repo/orders";
import { listReviewableItems } from "@/server/repo/reviews";
import { listWishlistProducts } from "@/server/repo/wishlist";

export const metadata: Metadata = { title: "Tài khoản", robots: { index: false } };

async function Account() {
  const user = await requireUser("/tai-khoan");
  const [orders, reviewable, wishlist] = await Promise.all([listOrdersByUser(user.id), listReviewableItems(user.id), listWishlistProducts(user.id)]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Xin chào, {user.name}</h1>
        <div className="flex flex-wrap gap-2">
          {/* Hồ sơ, sổ địa chỉ, mật khẩu, thiết bị, thông báo, quyền riêng tư nằm ở trang Cài đặt. */}
          <ButtonLink href="/tai-khoan/cai-dat" variant="secondary" size="sm">
            <Settings className="size-4" aria-hidden />
            Cài đặt
          </ButtonLink>
          <LogoutButton />
        </div>
      </div>

      {!user.emailVerified && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          Email {user.email} chưa được xác thực.{" "}
          <a href="/xac-thuc-email" className="font-semibold underline">
            Xác thực ngay
          </a>{" "}
          để bảo vệ tài khoản và đặt đơn thanh toán khi nhận hàng giá trị lớn không cần nhập mã.
        </p>
      )}

      <section aria-labelledby="don-hang" className="space-y-3">
        <h2 id="don-hang" className="text-lg font-semibold">
          Đơn hàng của bạn
        </h2>
        {orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
            Bạn chưa có đơn hàng nào.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={`/don-hang/${order.token}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm transition hover:bg-raised">
                  <span className="font-semibold">{order.code}</span>
                  <span className="text-muted">{formatDate(order.createdAt)}</span>
                  <span className="text-muted">{order.itemCount} sản phẩm</span>
                  <span className="ml-auto tabular-nums">{formatVnd(order.total)}</span>
                  <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium">{ORDER_STATUS_LABELS[order.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="yeu-thich" className="space-y-3">
        <h2 id="yeu-thich" className="text-lg font-semibold">
          Sản phẩm yêu thích
        </h2>
        {wishlist.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface px-5 py-8 text-center text-sm text-muted">
            Bấm biểu tượng trái tim ở sản phẩm để lưu vào đây.
          </p>
        ) : (
          <ProductGrid products={wishlist} />
        )}
      </section>

      {reviewable.length > 0 && (
        <section aria-labelledby="cho-danh-gia" className="space-y-3">
          <h2 id="cho-danh-gia" className="text-lg font-semibold">
            Sản phẩm chờ đánh giá
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
            {reviewable.map((item) => (
              <li key={item.orderItemId}>
                <ReviewForm
                  orderItemId={item.orderItemId}
                  title={`${item.productName}${item.variantName === "Bản thường" ? "" : ` (${item.variantName})`} · đơn ${item.orderCode}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải tài khoản...</p>}>
        <Account />
      </Suspense>
      <RecentlyViewed />
    </div>
  );
}
