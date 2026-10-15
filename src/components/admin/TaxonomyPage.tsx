import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { DeleteTaxonomyButton, TaxonomyForm } from "@/components/admin/TaxonomyForms";
import { formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listTaxonomy, type TaxonomyKind } from "@/server/repo/taxonomy";

const TITLES = {
  categories: { title: "Danh mục", label: "danh mục", path: "/admin/danh-muc" },
  brands: { title: "Thương hiệu", label: "thương hiệu", path: "/admin/thuong-hieu" },
  series: { title: "Series", label: "series", path: "/admin/series" },
} as const;

// Trang chung của /admin/danh-muc, /admin/thuong-hieu, /admin/series. `?sua=<id>` mở form sửa.
export async function TaxonomyPage({ kind, searchParams }: { kind: TaxonomyKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { title, label, path } = TITLES[kind];
  const user = await requireStaff("catalog.view", path);
  const editable = can(user.role, "catalog.edit");
  const [items, params] = await Promise.all([listTaxonomy(kind), searchParams]);
  const editing = editable ? items.find((item) => item.id === first(params.sua)) : undefined;
  const isCategory = kind === "categories";
  const parents = items.filter((item) => !item.parentId);

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        {title} ({formatNumber(items.length)})
      </h1>

      {items.length === 0 ? (
        <Empty>Chưa có {label} nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Tên</th>
                <th scope="col">Đường dẫn</th>
                {isCategory && <th scope="col">Thứ tự</th>}
                {isCategory && <th scope="col">Sản phẩm</th>}
                {editable && <th scope="col">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className={`font-medium ${item.parentId ? "pl-10!" : ""}`}>
                    {item.parentId && <span className="text-muted">└ </span>}
                    {item.name}
                    {isCategory && !item.parentId && <span className={`${BADGE} ml-2 text-muted`}>Gốc</span>}
                  </td>
                  <td className="text-muted">{item.slug}</td>
                  {isCategory && <td>{item.sortOrder}</td>}
                  {isCategory && <td>{formatNumber(item.productCount)}</td>}
                  {editable && (
                    <td>
                      <div className="flex flex-wrap items-start gap-2">
                        <Link href={`${path}?sua=${item.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                          Sửa
                        </Link>
                        <DeleteTaxonomyButton kind={kind} id={item.id} name={item.name} />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <TaxonomyForm key={editing?.id ?? "new"} kind={kind} label={label} basePath={path} item={editing} parents={parents} />
      )}
    </>
  );
}
