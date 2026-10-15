import Form from "next/form";
import Link from "next/link";
import { Empty, Pager, TABLE, TABLE_WRAP, first, isId, pageNumber } from "@/components/admin/parts";
import { Button } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { formatDateTime, formatNumber, parseVnDate } from "@/lib/format";
import { ROLE_LABELS, isRole } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { listAuditFacets, listAuditLogs } from "@/server/repo/audit";
import { listStaff } from "@/server/repo/staff";

const PAGE_SIZE = 50;
const DAY = 24 * 60 * 60 * 1000;

export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/nhat-ky">) {
  await requireStaff("audit.view", "/admin/nhat-ky");
  const params = await searchParams;
  const [staff, facets] = await Promise.all([listStaff(), listAuditFacets()]);

  // Chỉ nhận giá trị có trong danh sách chọn; giá trị lạ trên URL bị bỏ qua.
  const actorId = isId(first(params.nguoi)) ? first(params.nguoi) : "";
  const action = facets.actions.includes(first(params["hanh-dong"])) ? first(params["hanh-dong"]) : "";
  const entity = facets.entities.includes(first(params["doi-tuong"])) ? first(params["doi-tuong"]) : "";
  const entityId = first(params.ma).trim().slice(0, 40);
  const fromDate = first(params.tu);
  const toDate = first(params.den);
  const from = parseVnDate(fromDate);
  const toStart = parseVnDate(toDate);
  const page = pageNumber(params.trang);

  const { items, total } = await listAuditLogs({
    actorId,
    action,
    entity,
    entityId,
    from,
    // Tính cả ngày cuối: lấy tới 00:00 của ngày hôm sau.
    to: toStart === null ? null : toStart + DAY,
    page,
    pageSize: PAGE_SIZE,
  });

  const query = { nguoi: actorId, "hanh-dong": action, "doi-tuong": entity, ma: entityId, tu: from === null ? "" : fromDate, den: toStart === null ? "" : toDate };
  const href = (number: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, trang: number === 1 ? "" : String(number) })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/nhat-ky?${search}` : "/admin/nhat-ky";
  };

  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Nhật ký thao tác ({formatNumber(total)})</h1>

      <Form action="/admin/nhat-ky" className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-3" role="search">
        <SelectField label="Người làm" name="nguoi" defaultValue={actorId}>
          <option value="">Tất cả</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.email})
            </option>
          ))}
        </SelectField>
        <SelectField label="Hành động" name="hanh-dong" defaultValue={action}>
          <option value="">Tất cả</option>
          {facets.actions.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <SelectField label="Đối tượng" name="doi-tuong" defaultValue={entity}>
          <option value="">Tất cả</option>
          {facets.entities.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <Field label="Mã đối tượng" name="ma" defaultValue={entityId} maxLength={40} />
        <Field label="Từ ngày" name="tu" type="date" defaultValue={query.tu} />
        <Field label="Đến ngày" name="den" type="date" defaultValue={query.den} />
        <div className="flex items-center gap-4 sm:col-span-3">
          <Button type="submit" size="sm">
            Lọc
          </Button>
          <Link href="/admin/nhat-ky" className="text-sm font-medium text-brand-strong hover:underline">
            Xoá bộ lọc
          </Link>
        </div>
      </Form>

      {items.length === 0 ? (
        <Empty>Không có dòng nhật ký nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Thời gian</th>
                <th scope="col">Người làm</th>
                <th scope="col">Hành động</th>
                <th scope="col">Đối tượng</th>
                <th scope="col">Nội dung</th>
              </tr>
            </thead>
            <tbody>
              {items.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="whitespace-nowrap text-muted">{formatDateTime(log.createdAt)}</td>
                  <td>
                    {log.actorId ? (
                      <>
                        {log.actorName} <span className="block text-xs text-muted">{isRole(log.actorRole) ? ROLE_LABELS[log.actorRole] : log.actorRole}</span>
                      </>
                    ) : (
                      <span className="text-muted">Không xác định</span>
                    )}
                  </td>
                  <td className="font-mono text-xs whitespace-nowrap">{log.action}</td>
                  <td className="text-xs whitespace-nowrap">
                    {log.entity}
                    {log.entityId && <span className="block font-mono text-muted">{log.entityId}</span>}
                  </td>
                  <td>
                    {log.summary}
                    {log.detail !== "{}" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-muted">Chi tiết</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded-lg bg-raised p-2 text-xs">{JSON.stringify(JSON.parse(log.detail), null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={href} />
    </>
  );
}
