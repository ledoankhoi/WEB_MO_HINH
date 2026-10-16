import Form from "next/form";
import Link from "next/link";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, isId, pageNumber } from "@/components/admin/parts";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { ProductStatus } from "@/lib/types";
import { requireStaff } from "@/server/auth/session";
import { listAdminProducts } from "@/server/repo/products";
import { listTaxonomy } from "@/server/repo/taxonomy";

const STATUS_LABELS: Record<ProductStatus, string> = { draft: "Nháp", published: "Đang bán", archived: "Lưu trữ" };
const PAGE_SIZE = 30;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/san-pham">) {
  const user = await requireStaff("catalog.view", "/admin/san-pham");
  const params = await searchParams;
  const [categories, brands] = await Promise.all([listTaxonomy("categories"), listTaxonomy("brands")]);
  const statusParam = first(params["trang-thai"]);
  const status = statusParam in STATUS_LABELS ? (statusParam as ProductStatus) : undefined;
  const category = categories.some((c) => c.slug === first(params["danh-muc"])) ? first(params["danh-muc"]) : "";
  const brandId = isId(first(params["thuong-hieu"])) ? first(params["thuong-hieu"]) : "";
  const q = first(params.q).trim().slice(0, 60);
  const page = pageNumber(params.trang);
  const { items, total } = await listAdminProducts({ q, status, category: category || undefined, brandId: brandId || undefined, page, pageSize: PAGE_SIZE });
  const categoryName = new Map(categories.map((c) => [c.slug, c.name]));

  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, "trang-thai": status ?? "", "danh-muc": category, "thuong-hieu": brandId, trang: "", ...changes })) {
      if (value) next.set(key, value);
    }
    const search = next.toString();
    return search ? `/admin/san-pham?${search}` : "/admin/san-pham";
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Sản phẩm ({formatNumber(total)})</h1>
        {can(user.role, "catalog.edit") && (
          <ButtonLink href="/admin/san-pham/moi" size="sm">
            Thêm sản phẩm
          </ButtonLink>
        )}
      </div>

      <nav aria-label="Lọc theo trạng thái" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ "trang-thai": "" })} className={chip(!status)}>
          Tất cả
        </Link>
        {(Object.entries(STATUS_LABELS) as [ProductStatus, string][]).map(([value, label]) => (
          <Link key={value} href={href({ "trang-thai": value })} className={chip(status === value)}>
            {label}
          </Link>
        ))}
      </nav>

      <Form action="/admin/san-pham" className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end" role="search">
        {status && <input type="hidden" name="trang-thai" value={status} />}
        <Field label="Tên hoặc SKU" name="q" type="search" defaultValue={q} maxLength={60} />
        <SelectField label="Danh mục" name="danh-muc" defaultValue={category}>
          <option value="">Mọi danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Thương hiệu" name="thuong-hieu" defaultValue={brandId}>
          <option value="">Mọi thương hiệu</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </SelectField>
        <Button type="submit" size="sm">
          Lọc
        </Button>
      </Form>

      {items.length === 0 ? (
        <Empty>Không có sản phẩm nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Tên</th>
                <th scope="col">Danh mục</th>
                <th scope="col" className="text-right">Giá bán</th>
                <th scope="col" className="text-right">Có thể bán</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Link href={`/admin/san-pham/${product.id}`} className="font-medium hover:underline">
                      {product.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap text-muted">{categoryName.get(product.category) ?? product.category}</td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatVnd(product.price)}</td>
                  <td className={`text-right tabular-nums ${product.stock === 0 ? "font-semibold text-danger" : ""}`}>{formatNumber(product.stock)}</td>
                  <td>
                    <span className={BADGE}>{STATUS_LABELS[product.status]}</span>
                    {product.isFeatured && <span className={`${BADGE} ml-1.5`}>Nổi bật</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(number) => href({ trang: number === 1 ? "" : String(number) })} />
    </>
  );
}
