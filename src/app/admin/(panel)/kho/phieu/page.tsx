import Link from "next/link";
import { CreateDocumentMenu } from "@/components/admin/DocumentEditor";
import { BADGE, Empty, FilterPanel, Pager, TABLE, TABLE_WRAP, first, pageNumber } from "@/components/admin/parts";
import { formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  isDocumentStatus,
  isDocumentType,
} from "@/lib/stock";
import { requireStaff } from "@/server/auth/session";
import { listDocuments } from "@/server/repo/stock-documents";

const PAGE_SIZE = 20;

export default async function DocumentsPage({ searchParams }: PageProps<"/admin/kho/phieu">) {
  const user = await requireStaff("inventory.view", "/admin/kho/phieu");
  const params = await searchParams;
  const typeParam = first(params.loai);
  const statusParam = first(params["trang-thai"]);
  const type = isDocumentType(typeParam) ? typeParam : undefined;
  const status = isDocumentStatus(statusParam) ? statusParam : undefined;
  const page = pageNumber(params.trang);
  const { items, total } = await listDocuments({ type, status, page, pageSize: PAGE_SIZE });

  const href = (changes: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ loai: type ?? "", "trang-thai": status ?? "", trang: "", ...changes })) if (value) next.set(key, value);
    const search = next.toString();
    return search ? `/admin/kho/phieu?${search}` : "/admin/kho/phieu";
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Phiếu kho ({formatNumber(total)})</h1>
        {can(user.role, "inventory.draft") && <CreateDocumentMenu types={DOCUMENT_TYPES} />}
      </div>

      <FilterPanel
        active={[type && DOCUMENT_TYPE_LABELS[type], status && DOCUMENT_STATUS_LABELS[status]].filter((label): label is string => Boolean(label))}
        clearHref="/admin/kho/phieu"
        groups={[
          {
            label: "Loại phiếu",
            items: [
              { key: "", href: href({ loai: "" }), label: "Mọi loại", active: !type },
              ...DOCUMENT_TYPES.map((value) => ({ key: value, href: href({ loai: value }), label: DOCUMENT_TYPE_LABELS[value], active: type === value })),
            ],
          },
          {
            label: "Trạng thái",
            items: [
              { key: "", href: href({ "trang-thai": "" }), label: "Mọi trạng thái", active: !status },
              ...DOCUMENT_STATUSES.map((value) => ({ key: value, href: href({ "trang-thai": value }), label: DOCUMENT_STATUS_LABELS[value], active: status === value })),
            ],
          },
        ]}
      />

      {items.length === 0 ? (
        <Empty>Không có phiếu nào phù hợp.</Empty>
      ) : (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th scope="col">Mã phiếu</th>
                <th scope="col">Loại</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="text-right">
                  Dòng / SL
                </th>
                <th scope="col">Người tạo</th>
                <th scope="col">Tạo lúc</th>
              </tr>
            </thead>
            <tbody>
              {items.map((document) => (
                <tr key={document.id}>
                  <td>
                    <Link href={`/admin/kho/phieu/${document.id}`} className="font-mono font-semibold hover:underline">
                      {document.code}
                    </Link>
                  </td>
                  <td>{DOCUMENT_TYPE_LABELS[document.type]}</td>
                  <td>
                    <span className={BADGE}>{DOCUMENT_STATUS_LABELS[document.status]}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {document.lineCount} / {formatNumber(document.totalQty)}
                  </td>
                  <td>{document.createdByName ?? "Hệ thống"}</td>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(document.createdAt)}</td>
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
