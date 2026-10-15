import Link from "next/link";
import { BADGE, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { CreateStaffForm, StaffActions } from "@/components/admin/StaffForms";
import { formatDate, formatNumber } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listStaff } from "@/server/repo/staff";

export default async function AdminStaffPage() {
  const user = await requireStaff("staff.manage", "/admin/nhan-vien");
  const staff = await listStaff();

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Nhân viên ({formatNumber(staff.length)})</h1>

      <div className={TABLE_WRAP}>
        <table className={TABLE}>
          <thead>
            <tr>
              <th scope="col">Họ và tên</th>
              <th scope="col">Email</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Tạo lúc</th>
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td className="font-medium">
                  <Link href={`/admin/nhat-ky?nguoi=${member.id}`} className="hover:underline">
                    {member.name}
                  </Link>
                </td>
                <td>{member.email}</td>
                <td className="whitespace-nowrap">{ROLE_LABELS[member.role]}</td>
                <td>
                  {member.isActive ? (
                    <span className={BADGE}>Đang hoạt động</span>
                  ) : (
                    <span className={`${BADGE} bg-danger/10 text-danger`}>Đã khoá</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-muted">{formatDate(member.createdAt)}</td>
                <td>
                  {member.id === user.id ? (
                    <span className="text-sm text-muted">Tài khoản của bạn</span>
                  ) : (
                    <StaffActions id={member.id} name={member.name} role={member.role} isActive={member.isActive} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateStaffForm />
    </>
  );
}
