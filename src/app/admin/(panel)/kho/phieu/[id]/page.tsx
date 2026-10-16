import { notFound } from "next/navigation";
import type { DocumentActionKey } from "@/app/actions/inventory";
import { DocumentButtons, DocumentEditor, StocktakeStart } from "@/components/admin/DocumentEditor";
import { BADGE, TABLE, TABLE_WRAP, isId } from "@/components/admin/parts";
import { formatDateTime, formatNumber, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { DOCUMENT_REASONS, DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from "@/lib/stock";
import { requireStaff } from "@/server/auth/session";
import { listVariantOptions } from "@/server/repo/products";
import { findDocument, locationsInOpenStocktakes } from "@/server/repo/stock-documents";
import { listLocations, listSuppliers } from "@/server/repo/warehouse";

const VN_DATE = (ms: number) => new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default async function DocumentPage({ params }: PageProps<"/admin/kho/phieu/[id]">) {
  const { id } = await params;
  const user = await requireStaff("inventory.view", `/admin/kho/phieu/${id}`);
  const document = isId(id) ? await findDocument(id) : null;
  if (!document) notFound();

  const canPost = can(user.role, "inventory.post");
  const isOwner = document.createdBy === user.id;
  const canDraft = can(user.role, "inventory.draft") && (isOwner || canPost);
  const open = document.status === "draft" || document.status === "submitted";
  // K2–K5 theo docs/chuan/04 mục 6.1; máy chủ kiểm tra lại khi bấm.
  const allowed: DocumentActionKey[] = [];
  if (document.status === "draft" && canDraft && document.lines.length > 0) allowed.push("submit");
  if (open && canPost && document.lines.length > 0) allowed.push("post");
  if (document.status === "submitted" && canPost) allowed.push("return");
  if (open && canDraft) allowed.push("cancel");

  const editable = document.status === "draft" && canDraft;
  const [variants, locations, suppliers] = editable ? await Promise.all([listVariantOptions(), listLocations(), listSuppliers()]) : [[], [], []];
  const isReceipt = document.type === "receipt";
  const isStocktake = document.type === "stocktake";
  const busy = editable && isStocktake && !document.snapshotAt ? await locationsInOpenStocktakes(document.id) : new Set<string>();
  const label = (l: { code: string; type: string }) => (l.type === "quarantine" ? `${l.code} (cách ly)` : l.code);

  return (
    <>
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {DOCUMENT_TYPE_LABELS[document.type]} <span className="font-mono">{document.code}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className={BADGE}>{DOCUMENT_STATUS_LABELS[document.status]}</span>
          <span>
            Tạo bởi {document.createdByName ?? "Hệ thống"} lúc {formatDateTime(document.createdAt)}
          </span>
          {document.postedAt && (
            <span>
              · Ghi sổ bởi {document.postedByName ?? "Hệ thống"} lúc {formatDateTime(document.postedAt)}
            </span>
          )}
        </div>
      </div>

      {editable && isStocktake && !document.snapshotAt ? (
        <StocktakeStart id={document.id} locations={locations.filter((l) => l.isActive).map((l) => ({ id: l.id, label: label(l), busy: busy.has(l.id) }))} />
      ) : editable ? (
        <DocumentEditor
          document={{
            id: document.id,
            type: document.type,
            supplierId: document.supplierId,
            reasonCode: document.reasonCode,
            orderCode: document.orderCode ?? "",
            reference: document.reference,
            note: document.note,
            expectedDate: document.expectedAt ? VN_DATE(document.expectedAt) : "",
            lines: document.lines.map((line) => ({
              variantId: line.variantId,
              sku: line.sku,
              name: line.name,
              locationId: line.locationId,
              toLocationId: line.toLocationId ?? "",
              qtyExpected: line.qtyExpected?.toString() ?? "",
              qty: line.qty?.toString() ?? "",
              qtyQuarantined: line.qtyQuarantined?.toString() ?? "",
              unitCost: line.unitCost?.toString() ?? "",
              note: line.note,
            })),
          }}
          variants={variants}
          locations={locations
            .filter((l) =>
              isStocktake
                ? document.countLocations.includes(l.id)
                : l.isActive && (isReceipt ? l.type === "storage" : document.type === "return" ? l.type === "quarantine" : true),
            )
            .map((l) => ({ id: l.id, label: label(l) }))}
          toLocations={locations.filter((l) => l.isActive).map((l) => ({ id: l.id, label: label(l) }))}
          suppliers={suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, label: `${s.code} · ${s.name}` }))}
        />
      ) : (
        <section className="space-y-4">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            {document.supplierName && (
              <>
                <dt className="text-muted">Nhà cung cấp</dt>
                <dd>{document.supplierName}</dd>
              </>
            )}
            {DOCUMENT_REASONS[document.type] && (
              <>
                <dt className="text-muted">Lý do</dt>
                <dd>{DOCUMENT_REASONS[document.type]?.[document.reasonCode] ?? document.reasonCode}</dd>
              </>
            )}
            {document.orderCode && (
              <>
                <dt className="text-muted">Đơn hàng</dt>
                <dd className="font-mono">{document.orderCode}</dd>
              </>
            )}
            {document.reference && (
              <>
                <dt className="text-muted">Số chứng từ</dt>
                <dd>{document.reference}</dd>
              </>
            )}
            {document.note && (
              <>
                <dt className="text-muted">Ghi chú</dt>
                <dd>{document.note}</dd>
              </>
            )}
          </dl>
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Sản phẩm</th>
                  <th scope="col">Vị trí</th>
                  {isReceipt && <th scope="col" className="text-right">Dự kiến</th>}
                  {isStocktake && <th scope="col" className="text-right">Sổ sách</th>}
                  <th scope="col" className="text-right">
                    {isReceipt ? "Thực nhận" : isStocktake ? "Đếm được" : "Số lượng"}
                  </th>
                  {isReceipt && <th scope="col" className="text-right">Cách ly</th>}
                  {isReceipt && <th scope="col" className="text-right">Đơn giá</th>}
                  <th scope="col">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line) => {
                  const expected = isStocktake ? line.systemQty : line.qtyExpected;
                  const diff = expected === null || line.qty === null ? 0 : line.qty - expected;
                  return (
                    <tr key={`${line.variantId}-${line.locationId}`}>
                      <td>
                        <span className="font-mono text-xs text-muted">{line.sku}</span> {line.name}
                      </td>
                      <td className="font-mono">
                        {line.locationCode}
                        {line.toLocationCode && ` → ${line.toLocationCode}`}
                      </td>
                      {isReceipt && <td className="text-right tabular-nums">{line.qtyExpected ?? ""}</td>}
                      {isStocktake && <td className="text-right tabular-nums">{line.systemQty ?? 0}</td>}
                      <td className="text-right tabular-nums">
                        {line.qty === null ? "Chưa đếm" : formatNumber(line.qty)}
                        {diff !== 0 && <span className="ml-1 text-xs font-semibold text-danger">({diff > 0 ? `thừa ${diff}` : `thiếu ${-diff}`})</span>}
                      </td>
                      {isReceipt && <td className="text-right tabular-nums">{line.qtyQuarantined || ""}</td>}
                      {isReceipt && <td className="text-right tabular-nums">{line.unitCost === null ? "" : formatVnd(line.unitCost)}</td>}
                      <td className="text-muted">{line.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <DocumentButtons id={document.id} allowed={allowed} />
    </>
  );
}
