import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { ButtonLink } from "@/components/ui/Button";
import { getCategory } from "@/lib/catalog";
import { formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listAllProducts } from "@/server/repo/products";

export default async function AdminProductsPage() {
  const user = await requireStaff("catalog.view", "/admin/san-pham");
  // shortcut: tải toàn bộ sản phẩm vào một bảng, chuyển sang queryProducts (tìm kiếm, phân trang) khi vượt vài trăm sản phẩm.
  const products = await listAllProducts();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Sản phẩm ({formatNumber(products.length)})</h1>
        {can(user.role, "catalog.edit") && (
          <ButtonLink href="/admin/san-pham/moi" size="sm">
            Thêm sản phẩm
          </ButtonLink>
        )}
      </div>

      {products.length === 0 ? (
        <Empty>Chưa có sản phẩm nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Tên</th>
                <th scope="col">Danh mục</th>
                <th scope="col" className="text-right">
                  Giá bán
                </th>
                <th scope="col" className="text-right">
                  Tồn kho
                </th>
                <th scope="col" className="text-right">
                  Đã bán
                </th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Link href={`/admin/san-pham/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-muted">{getCategory(product.category)?.name ?? product.category}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(product.price)}</td>
                  <td className={`text-right tabular-nums ${product.stock === 0 ? "font-semibold text-danger" : ""}`}>
                    {formatNumber(product.stock)}
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(product.sold)}</td>
                  <td>
                    <span className={BADGE}>{product.isActive ? "Đang bán" : "Đang ẩn"}</span>
                    {product.isFeatured && <span className={`${BADGE} ml-1.5`}>Nổi bật</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
