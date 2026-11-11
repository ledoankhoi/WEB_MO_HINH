"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelReturnAction } from "@/app/actions/returns";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { formatVnd } from "@/lib/format";
import { MAX_RETURN_IMAGES, RETURN_REASONS, isReturnReason, suggestedRefund, type ReturnReason } from "@/lib/returns";

type Line = { lineId: number; label: string; unitPrice: number; quantity: number };
type Money = { subtotal: number; discount: number; total: number };

// Form yêu cầu trả hàng trên trang đơn (nghiep-vu-ban-hang mục 4). Gửi multipart tới /api/don-hang/[token]/tra-hang.
export function ReturnRequestForm({ token, lines, money, deadlineText }: { token: string; lines: Line[]; money: Money; deadlineText: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: Record<string, string> } | null>(null);

  const picks = new Map(Object.entries(qty).filter(([, n]) => n > 0).map(([id, n]) => [Number(id), n]));
  const refund = suggestedRefund({ ...money, items: lines }, picks);
  const errors = result?.errors ?? {};

  if (result?.ok) return <Notice tone="success">{result.message}</Notice>;
  if (!open) {
    return (
      <div className="space-y-2 rounded-xl border border-line bg-surface p-5 text-sm">
        <p className="font-semibold">Cần trả hàng?</p>
        <p className="text-muted">Bạn có thể yêu cầu trả hàng, hoàn tiền tới {deadlineText}.</p>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Yêu cầu trả hàng
        </Button>
      </div>
    );
  }

  async function submit(form: HTMLFormElement) {
    setPending(true);
    try {
      const response = await fetch(`/api/don-hang/${encodeURIComponent(token)}/tra-hang`, { method: "POST", body: new FormData(form) });
      const body = (await response.json().catch(() => ({ ok: false, message: "Không gửi được yêu cầu." }))) as typeof result;
      setResult(body);
      if (body?.ok) router.refresh();
    } catch {
      setResult({ ok: false, message: "Mất kết nối. Vui lòng thử lại." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface p-5 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-semibold">Yêu cầu trả hàng</p>
        <span className="text-xs text-muted">Hạn: {deadlineText}</span>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 font-medium">Sản phẩm muốn trả</legend>
        {lines.map((line) => (
          <label key={line.lineId} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
            <span>
              {line.label} <span className="text-muted">· {formatVnd(line.unitPrice)}</span>
            </span>
            <select
              name={`qty-${line.lineId}`}
              value={qty[line.lineId] ?? 0}
              onChange={(event) => setQty({ ...qty, [line.lineId]: Number(event.target.value) })}
              className="h-9 rounded-lg border border-line bg-surface px-2"
              aria-label={`Số lượng trả: ${line.label}`}
            >
              {Array.from({ length: line.quantity + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Không trả" : `Trả ${n}`}
                </option>
              ))}
            </select>
          </label>
        ))}
        {errors.items && <p className="text-xs text-danger" role="alert">{errors.items}</p>}
      </fieldset>

      <SelectField label="Lý do" name="reason" required value={reason} error={errors.reason} onChange={(event) => setReason(isReturnReason(event.target.value) ? event.target.value : "")}>
        <option value="">Chọn lý do</option>
        {Object.entries(RETURN_REASONS).map(([key, value]) => (
          <option key={key} value={key}>
            {value.label}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        label="Mô tả tình trạng hàng"
        name="note"
        maxLength={1000}
        required={reason !== "" && reason !== "changed_mind"}
        error={errors.note}
        hint="Ví dụ: gãy khớp vai trái, thiếu tờ decal, hộp móp góc..."
      />

      <div className="space-y-1.5">
        <label htmlFor="return-images" className="block font-medium">
          Ảnh chụp hàng {reason && RETURN_REASONS[reason].photo ? <span className="text-danger">*</span> : <span className="text-muted">(không bắt buộc)</span>}
        </label>
        <input id="return-images" name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="block w-full text-sm" />
        <p className={`text-xs ${errors.images ? "text-danger" : "text-muted"}`}>{errors.images ?? `Tối đa ${MAX_RETURN_IMAGES} ảnh JPEG, PNG hoặc WebP, mỗi ảnh 3 MB.`}</p>
      </div>

      <TextAreaField
        label="Tài khoản nhận tiền hoàn"
        name="account"
        rows={2}
        required
        maxLength={200}
        error={errors.account}
        hint="Ngân hàng, số tài khoản, tên chủ tài khoản."
      />

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-muted">Dự kiến hoàn</span>
        <strong className="tabular-nums">{formatVnd(refund)}</strong>
      </div>
      <p className="text-xs text-muted">
        Đã trừ phần giảm giá tương ứng; phí giao hàng không hoàn trừ khi lỗi do cửa hàng. Số tiền chính thức do cửa hàng xác nhận khi duyệt.
      </p>

      {result && !result.ok && <Notice tone="error">{result.message}</Notice>}
      <div className="flex gap-2">
        <Button type="submit" pending={pending} disabled={picks.size === 0}>
          Gửi yêu cầu
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Đóng
        </Button>
      </div>
    </form>
  );
}

export function CancelReturnButton({ token, requestId }: { token: string; requestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        variant="danger"
        pending={pending}
        onClick={() => {
          if (!window.confirm("Huỷ yêu cầu trả hàng này?")) return;
          startTransition(async () => {
            const result = await cancelReturnAction(token, requestId);
            setError(result.ok ? "" : (result.message ?? "Không huỷ được."));
          });
        }}
      >
        Huỷ yêu cầu
      </Button>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
