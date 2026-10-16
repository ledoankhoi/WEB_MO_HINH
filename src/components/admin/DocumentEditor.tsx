"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { createDocumentAction, documentAction, resolveQuarantineAction, saveDraftAction, startStocktakeAction, type DocumentActionKey } from "@/app/actions/inventory";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { DOCUMENT_REASONS, DOCUMENT_TYPE_LABELS, type StockDocumentType } from "@/lib/stock";
import type { FormState } from "@/lib/types";

type Option = { id: string; label: string };
type VariantOption = { id: string; sku: string; barcode: string | null; name: string };
type Line = {
  variantId: string;
  sku: string;
  name: string;
  locationId: string;
  toLocationId: string;
  qtyExpected: string;
  qty: string;
  qtyQuarantined: string;
  unitCost: string;
  note: string;
};

export type EditorDocument = {
  id: string;
  type: StockDocumentType;
  supplierId: string | null;
  reasonCode: string;
  orderCode: string;
  reference: string;
  note: string;
  expectedDate: string;
  lines: Line[];
};

// Cột số lượng của từng loại phiếu (T10, T11 thêm loại khác).
const COLUMNS: Partial<Record<StockDocumentType, { key: "qtyExpected" | "qty" | "qtyQuarantined" | "unitCost"; label: string }[]>> = {
  receipt: [
    { key: "qtyExpected", label: "SL dự kiến" },
    { key: "qty", label: "SL thực nhận" },
    { key: "qtyQuarantined", label: "Trong đó cách ly" },
    { key: "unitCost", label: "Đơn giá nhập (₫)" },
  ],
  issue: [{ key: "qty", label: "SL xuất" }],
  transfer: [{ key: "qty", label: "SL chuyển" }],
  return: [{ key: "qty", label: "SL nhận về" }],
  adjustment: [{ key: "qty", label: "SL điều chỉnh (+/−)" }],
  // Không hiện số sổ sách khi đang đếm (YC-KHO-07).
  stocktake: [{ key: "qty", label: "Số đếm" }],
};

const cell = "h-9 w-24 rounded-lg border border-line bg-surface px-2 text-right text-sm tabular-nums focus:border-brand focus:outline-none";

export function DocumentEditor({
  document,
  variants,
  locations,
  toLocations = [],
  suppliers,
}: {
  document: EditorDocument;
  variants: VariantOption[];
  // Vị trí nguồn (phiếu chuyển), vị trí nhận hoặc xuất (phiếu khác).
  locations: Option[];
  // Vị trí đích của phiếu chuyển.
  toLocations?: Option[];
  suppliers: Option[];
}) {
  const [header, setHeader] = useState({
    supplierId: document.supplierId ?? "",
    reasonCode: document.reasonCode,
    orderCode: document.orderCode,
    reference: document.reference,
    note: document.note,
    expectedAt: document.expectedDate,
  });
  const [lines, setLines] = useState<Line[]>(document.lines);
  const [scan, setScan] = useState("");
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const columns = COLUMNS[document.type] ?? [];
  const reasons = DOCUMENT_REASONS[document.type];

  const update = (index: number, change: Partial<Line>) => setLines(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  // Q23: máy quét mã vạch gõ mã rồi Enter. Đã có dòng của sản phẩm thì cộng 1 vào SL thực, chưa có thì thêm dòng.
  const addByCode = () => {
    const code = scan.trim().toUpperCase();
    if (!code) return;
    const variant = variants.find((v) => v.sku.toUpperCase() === code || v.barcode?.toUpperCase() === code);
    if (!variant) {
      setResult({ message: `Không tìm thấy SKU hoặc mã vạch “${scan.trim()}”.` });
      return;
    }
    const index = lines.findIndex((line) => line.variantId === variant.id);
    if (index >= 0) update(index, { qty: String(Number(lines[index].qty || 0) + 1) });
    else setLines([...lines, { variantId: variant.id, sku: variant.sku, name: variant.name, locationId: locations[0]?.id ?? "", toLocationId: toLocations.find((l) => l.id !== locations[0]?.id)?.id ?? "", qtyExpected: "", qty: "1", qtyQuarantined: "", unitCost: "", note: "" }]);
    setScan("");
    setResult({});
  };

  const save = () =>
    startTransition(async () => {
      setResult(await saveDraftAction(document.id, { ...header, lines }));
    });

  return (
    <section className="space-y-5 rounded-xl border border-line bg-surface p-5 sm:p-6">
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2">
        {document.type === "receipt" && (
          <SelectField label="Nhà cung cấp" name="supplierId" value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}>
            <option value="">Không chọn</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </SelectField>
        )}
        {reasons && (
          <SelectField label="Lý do" name="reasonCode" value={header.reasonCode} onChange={(e) => setHeader({ ...header, reasonCode: e.target.value })}>
            {Object.entries(reasons).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </SelectField>
        )}
        {document.type === "return" && (
          <Field label="Mã đơn hàng (nếu có)" name="orderCode" maxLength={20} value={header.orderCode} onChange={(e) => setHeader({ ...header, orderCode: e.target.value })} />
        )}
        <Field label="Số chứng từ, hoá đơn" name="reference" maxLength={60} value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })} />
        {document.type === "receipt" && (
          <Field label="Ngày dự kiến nhận" name="expectedAt" type="date" value={header.expectedAt} onChange={(e) => setHeader({ ...header, expectedAt: e.target.value })} />
        )}
        <div className="sm:col-span-2">
          <TextAreaField label="Ghi chú" name="note" rows={2} maxLength={500} value={header.note} onChange={(e) => setHeader({ ...header, note: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field
            label="Quét mã vạch hoặc nhập SKU rồi Enter"
            name="scan"
            list="variant-skus"
            autoComplete="off"
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addByCode();
              }
            }}
          />
          <datalist id="variant-skus">
            {variants.map((v) => (
              <option key={v.id} value={v.sku}>
                {v.name}
              </option>
            ))}
          </datalist>
        </div>
        <Button type="button" variant="secondary" onClick={addByCode}>
          Thêm dòng
        </Button>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium [&_th]:text-muted">
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col">{document.type === "transfer" ? "Từ vị trí" : "Vị trí"}</th>
                {document.type === "transfer" && <th scope="col">Đến vị trí</th>}
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="text-right">
                    {column.label}
                  </th>
                ))}
                {document.type === "receipt" && <th scope="col" className="text-right">Chênh lệch</th>}
                <th scope="col">Ghi chú</th>
                <th scope="col">
                  <span className="sr-only">Xoá</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const diff = line.qtyExpected === "" ? null : Number(line.qty || 0) - Number(line.qtyExpected);
                return (
                  <tr key={`${line.variantId}-${index}`} className="border-t border-line">
                    <td className="min-w-48">
                      <span className="font-mono text-xs text-muted">{line.sku}</span>
                      <br />
                      {line.name}
                    </td>
                    <td>
                      <select aria-label={`Vị trí của ${line.sku}`} value={line.locationId} onChange={(e) => update(index, { locationId: e.target.value })} className={`${cell} w-32 text-left`}>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {document.type === "transfer" && (
                      <td>
                        <select aria-label={`Vị trí đích của ${line.sku}`} value={line.toLocationId} onChange={(e) => update(index, { toLocationId: e.target.value })} className={`${cell} w-32 text-left`}>
                          <option value="">Chọn</option>
                          {toLocations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className="text-right">
                        <input
                          aria-label={`${column.label} của ${line.sku}`}
                          inputMode="numeric"
                          value={line[column.key]}
                          onChange={(e) => update(index, { [column.key]: document.type === "adjustment" ? e.target.value.replace(/(?!^-)\D/g, "") : e.target.value.replace(/\D/g, "") })}
                          className={column.key === "unitCost" ? `${cell} w-32` : cell}
                        />
                      </td>
                    ))}
                    {document.type === "receipt" && (
                      <td className={`text-right tabular-nums ${diff ? "font-semibold text-danger" : "text-muted"}`}>
                        {diff === null ? "" : diff > 0 ? `Thừa ${diff}` : diff < 0 ? `Thiếu ${-diff}` : "Đủ"}
                      </td>
                    )}
                    <td>
                      <input aria-label={`Ghi chú của ${line.sku}`} maxLength={200} value={line.note} onChange={(e) => update(index, { note: e.target.value })} className={`${cell} w-40 text-left`} />
                    </td>
                    <td>
                      <button type="button" aria-label={`Xoá dòng ${line.sku}`} onClick={() => setLines(lines.filter((_, i) => i !== index))} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-danger">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Button onClick={save} pending={pending}>
        Lưu nháp
      </Button>
    </section>
  );
}

// Nút K2–K5 mà máy chủ đã tính là được phép với phiếu và người xem.
export function DocumentButtons({ id, allowed }: { id: string; allowed: DocumentActionKey[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  if (allowed.length === 0) return null;
  const labels: Record<DocumentActionKey, string> = { submit: "Gửi ghi sổ", return: "Trả lại để sửa", cancel: "Huỷ phiếu", post: "Ghi sổ" };
  const confirms: Partial<Record<DocumentActionKey, string>> = {
    post: "Ghi sổ phiếu này? Sau khi ghi sổ không sửa, không huỷ được (QT-12). Nhớ lưu nháp trước nếu vừa sửa.",
    cancel: "Huỷ phiếu này?",
  };
  return (
    <div className="space-y-3">
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <div className="flex flex-wrap gap-3">
        {allowed.map((key) => (
          <Button
            key={key}
            variant={key === "post" ? "primary" : key === "cancel" ? "danger" : "secondary"}
            disabled={pending}
            onClick={() => {
              if (confirms[key] && !window.confirm(confirms[key])) return;
              startTransition(async () => setResult(await documentAction(id, key)));
            }}
          >
            {labels[key]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function CreateDocumentButton({ type }: { type: StockDocumentType }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  return (
    <>
      <Button size="sm" disabled={pending} onClick={() => startTransition(async () => setResult(await createDocumentAction(type)))}>
        Tạo {DOCUMENT_TYPE_LABELS[type].toLowerCase()}
      </Button>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </>
  );
}

// YC-KHO-09: tạo phiếu nháp điền sẵn để bán lại (chuyển sang kệ) hoặc huỷ (xuất hư hỏng) hàng cách ly.
export function QuarantineActions({ variantId, locationId }: { variantId: string; locationId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (decision: "resell" | "scrap") => startTransition(async () => setResult(await resolveQuarantineAction(variantId, locationId, decision)));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("resell")}>
          Bán lại được
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run("scrap")}>
          Huỷ hàng
        </Button>
      </div>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}

// YC-KHO-07: chọn vị trí (một, nhiều hoặc toàn kho) rồi chụp số sổ sách để bắt đầu đếm.
export function StocktakeStart({ id, locations }: { id: string; locations: (Option & { busy: boolean })[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const free = locations.filter((l) => !l.busy);
  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Chọn vị trí cần kiểm kê</h2>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setChosen(free.map((l) => l.id))}>
          Chọn toàn kho
        </Button>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Vị trí</legend>
        {locations.map((l) => (
          <label key={l.id} className={`flex items-center gap-2 text-sm ${l.busy ? "text-muted" : ""}`}>
            <input
              type="checkbox"
              disabled={l.busy}
              checked={chosen.includes(l.id)}
              onChange={(e) => setChosen(e.target.checked ? [...chosen, l.id] : chosen.filter((x) => x !== l.id))}
              className="size-4 accent-brand"
            />
            {l.label}
            {l.busy && " (đang kiểm kê ở phiếu khác)"}
          </label>
        ))}
      </fieldset>
      <Button disabled={pending || chosen.length === 0} onClick={() => startTransition(async () => setResult(await startStocktakeAction(id, chosen)))}>
        Chụp số sổ sách và bắt đầu đếm
      </Button>
    </section>
  );
}
