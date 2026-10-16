import Link from "next/link";
import { DeleteNavButton, NavItemForm } from "@/components/admin/ContentForms";
import { BADGE, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { requireStaff } from "@/server/auth/session";
import { listNavItems } from "@/server/repo/content";

const MENUS = { header: "Đầu trang", footer: "Chân trang (Hỗ trợ)" } as const;

// YC-CMS-03. `?sua=<id>` mở form sửa.
export default async function MenuPage({ searchParams }: PageProps<"/admin/noi-dung/menu">) {
  await requireStaff("content.edit", "/admin/noi-dung/menu");
  const [items, params] = await Promise.all([listNavItems(), searchParams]);
  const editing = items.find((item) => item.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Menu cửa hàng</h1>
      {(Object.entries(MENUS) as [keyof typeof MENUS, string][]).map(([menu, label]) => (
        <section key={menu} className="space-y-2">
          <h2 className="text-lg font-semibold">{label}</h2>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Thứ tự</th>
                  <th scope="col">Nhãn</th>
                  <th scope="col">Liên kết</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((item) => item.menu === menu)
                  .map((item) => (
                    <tr key={item.id} className={item.isActive ? "" : "text-muted"}>
                      <td className="tabular-nums">{item.sortOrder}</td>
                      <td className="font-medium">
                        {item.label}
                        {!item.isActive && <span className={`${BADGE} ml-1.5`}>Đang ẩn</span>}
                      </td>
                      <td className="font-mono text-xs">{item.url}</td>
                      <td>
                        <div className="flex flex-wrap items-start gap-2">
                          <Link href={`/admin/noi-dung/menu?sua=${item.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                            Sửa
                          </Link>
                          <DeleteNavButton id={item.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <NavItemForm key={editing?.id ?? "new"} item={editing} />
    </>
  );
}
