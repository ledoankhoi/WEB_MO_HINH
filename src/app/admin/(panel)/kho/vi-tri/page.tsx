import Link from "next/link";
import { BADGE, Empty, TABLE, TABLE_WRAP, first } from "@/components/admin/parts";
import { ActiveToggle, LocationForm } from "@/components/admin/WarehouseForms";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/server/auth/session";
import { listLocations } from "@/server/repo/warehouse";

// YC-KHO-01: vị trí của kho KHO-01. `?sua=<id>` mở form sửa.
export default async function LocationsPage({ searchParams }: PageProps<"/admin/kho/vi-tri">) {
  await requireStaff("inventory.setup", "/admin/kho/vi-tri");
  const [locations, params] = await Promise.all([listLocations(), searchParams]);
  const editing = locations.find((location) => location.id === first(params.sua));

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Vị trí kho ({formatNumber(locations.length)})</h1>
      {locations.length === 0 ? (
        <Empty>Chưa có vị trí nào.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã</th>
                <th scope="col">Tên</th>
                <th scope="col">Loại</th>
                <th scope="col" className="text-right">
                  Đang chứa
                </th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((location) => (
                <tr key={location.id} className={location.isActive ? "" : "text-muted"}>
                  <td className="font-mono font-medium">{location.code}</td>
                  <td>{location.name}</td>
                  <td>
                    <span className={BADGE}>{location.type === "storage" ? "Kệ hàng" : "Cách ly"}</span>
                    {!location.isActive && <span className={`${BADGE} ml-1.5`}>Ngừng dùng</span>}
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(location.onHand)}</td>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <Link href={`/admin/kho/vi-tri?sua=${location.id}`} className="py-1.5 text-sm font-medium text-brand-strong hover:underline">
                        Sửa
                      </Link>
                      <ActiveToggle kind="location" id={location.id} active={location.isActive} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LocationForm key={editing?.id ?? "new"} location={editing} />
    </>
  );
}
