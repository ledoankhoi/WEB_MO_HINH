import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { ActiveToggle, SupplierForm } from "@/components/admin/WarehouseForms";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listSuppliers } from "@/server/repo/warehouse";

// YC-KHO-02. `?sua=<id>` mở form sửa.
export default async function SuppliersPage({ searchParams }: PageProps<"/admin/nha-cung-cap">) {
  await requireStaff("inventory.setup", "/admin/nha-cung-cap");
  const [suppliers, params] = await Promise.all([listSuppliers(), searchParams]);
  const editing = suppliers.find((supplier) => supplier.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Nhà cung cấp ({formatNumber(suppliers.length)})</h1>
      {suppliers.length === 0 ? (
        <Empty>Chưa có nhà cung cấp nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên</th>
                <th scope="col">Liên hệ</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className={supplier.isActive ? "" : "text-muted"}>
                  <td className="font-mono font-medium">{supplier.code}</td>
                  <td>
                    {supplier.name}
                    {!supplier.isActive && <span className={`${BADGE} ml-1.5`}>Ngừng giao dịch</span>}
                  </td>
                  <td>{[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(" · ")}</td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`/admin/nha-cung-cap?sua=${supplier.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                        Sửa
                      </Link>
                      <ActiveToggle kind="supplier" id={supplier.id} active={supplier.isActive} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SupplierForm key={editing?.id ?? "new"} supplier={editing} />
    </>
  );
}
