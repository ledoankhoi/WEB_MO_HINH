import Link from "next/link";
import { AdminSuspense } from "@/components/admin/AdminSuspense";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { BundleForm } from "@/components/admin/BundleForm";
import { requireStaff } from "@/server/auth/session";
import { listAllDeals } from "@/server/repo/bundles";
import { listAdminProducts } from "@/server/repo/products";

// Combo giảm giá khi mua đủ bộ (nghiep-vu-ban-hang mục 12). Giỏ hàng tự áp dụng và gợi ý món còn thiếu.
export default function BundlesPage(props: PageProps<"/admin/combo">) {
  return (
    <AdminSuspense>
      <BundlesPageContent {...props} />
    </AdminSuspense>
  );
}

async function BundlesPageContent({ searchParams }: PageProps<"/admin/combo">) {
  await requireStaff("coupons.manage", "/admin/combo");
  const editing = first((await searchParams).sua);
  const [deals, products] = await Promise.all([listAllDeals(), listAdminProducts({ pageSize: 100 })]);
  const deal = deals.find((item) => item.id === editing);
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Combo giảm giá</h1>
        <p className="max-w-3xl text-sm text-muted">
          Giỏ có ít nhất một món của mỗi sản phẩm trong combo thì mỗi bộ đủ được giảm phần trăm đã đặt (tính trên giá phiên bản, món rẻ trước). Một món chỉ tính
          cho một combo; giảm combo cộng thêm với mã giảm giá. Giỏ chưa đủ bộ thì gợi ý món còn thiếu.
        </p>
      </div>
      {deals.length === 0 ? (
        <Empty>Chưa có combo nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Combo</th>
                <th scope="col">Giảm</th>
                <th scope="col">Sản phẩm</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium">{item.name}</td>
                  <td className="tabular-nums">{item.percent}%</td>
                  <td className="text-muted">{item.members.map((member) => member.name).join(", ")}</td>
                  <td>
                    <span className={BADGE}>{item.isActive ? "Đang bật" : "Đã tắt"}</span>
                  </td>
                  <td>
                    <Link href={`/admin/combo?sua=${item.id}`} className="font-medium text-brand-strong hover:underline">
                      Sửa
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <BundleForm deal={deal} products={products.items.map((product) => ({ id: product.id, name: product.name, status: product.status }))} />
    </>
  );
}
