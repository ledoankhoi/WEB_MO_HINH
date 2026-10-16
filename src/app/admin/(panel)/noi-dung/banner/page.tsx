import Link from "next/link";
import { BannerButtons, BannerForm } from "@/components/admin/BannerForms";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { HeroBanner, StripBanners } from "@/components/content/Banners";
import { formatDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listBanners } from "@/server/repo/content";

const PLACEMENTS = { home_hero: "Khung lớn", home_strip: "Dải nhỏ" } as const;

// YC-CMS-01, 07: banner trang chủ, xem trước bằng chính component của cửa hàng (Q20). `?sua=<id>` mở form sửa.
export default async function BannersPage({ searchParams }: PageProps<"/admin/noi-dung/banner">) {
  await requireStaff("content.edit", "/admin/noi-dung/banner");
  const [banners, params] = await Promise.all([listBanners(), searchParams]);
  const editing = banners.find((banner) => banner.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Banner ({banners.length})</h1>
      {banners.length === 0 ? (
        <Empty>Chưa có banner nào. Trang chủ đang hiện phần giới thiệu mặc định.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Banner</th>
                <th scope="col">Vị trí</th>
                <th scope="col">Thời gian hiện</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {banners.map((banner) => (
                <tr key={banner.id}>
                  <td className="font-medium">{banner.title}</td>
                  <td>
                    {PLACEMENTS[banner.placement]} · {banner.sortOrder}
                  </td>
                  <td className="text-muted">
                    {banner.startsAt ? formatDateTime(banner.startsAt) : "Ngay"} → {banner.endsAt ? formatDateTime(banner.endsAt) : "Không hạn"}
                  </td>
                  <td>
                    <span className={BADGE}>{banner.status === "published" ? "Đã xuất bản" : "Nháp"}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`/admin/noi-dung/banner?sua=${banner.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                        Sửa, xem trước
                      </Link>
                      <BannerButtons id={banner.id} status={banner.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BannerForm key={editing?.id ?? "new"} banner={editing} />

      {editing && (
        <section aria-label="Xem trước" className="space-y-3 rounded-2xl border border-dashed border-line p-4">
          <p className="text-sm text-muted">Xem trước theo dữ liệu đã lưu{editing.status === "draft" ? " (bản nháp, khách chưa thấy)" : ""}:</p>
          {editing.placement === "home_hero" ? <HeroBanner banner={editing} /> : <StripBanners banners={[editing]} />}
        </section>
      )}
    </>
  );
}
