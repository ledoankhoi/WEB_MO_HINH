import Link from "next/link";
import { CreateDocumentButton } from "@/components/admin/DocumentEditor";
import { BADGE, Empty, Pager, TABLE, TABLE_WRAP, chip, first, pageNumber } from "@/components/admin/parts";
import { formatDateTime, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  isDocumentStatus,
  isDocumentType,
  type StockDocumentType,
} from "@/lib/stock";
import { requireStaff } from "@/server/auth/session";
import { listDocuments } from "@/server/repo/stock-documents";

const PAGE_SIZE = 20;
// Loại phiếu đã ghi sổ được (T10, T11 thêm các loại còn lại).
const CREATABLE: StockDocumentType[] = ["receipt", "issue", "transfer", "return"];

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
        {can(user.role, "inventory.draft") && (
          <div className="flex flex-wrap gap-2">
            {CREATABLE.map((value) => (
              <CreateDocumentButton key={value} type={value} />
            ))}
          </div>
        )}
      </div>

      <nav aria-label="Lọc theo loại phiếu" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ loai: "" })} className={chip(!type)}>
          Mọi loại
        </Link>
        {DOCUMENT_TYPES.map((value) => (
          <Link key={value} href={href({ loai: value })} className={chip(type === value)}>
            {DOCUMENT_TYPE_LABELS[value]}
          </Link>
        ))}
      </nav>
      <nav aria-label="Lọc theo trạng thái" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={href({ "trang-thai": "" })} className={chip(!status)}>
          Mọi trạng thái
        </Link>
        {DOCUMENT_STATUSES.map((value) => (
          <Link key={value} href={href({ "trang-thai": value })} className={chip(status === value)}>
            {DOCUMENT_STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

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
