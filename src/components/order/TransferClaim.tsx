"use client";

import { useState, useTransition } from "react";
import { claimTransferAction } from "@/app/actions/bank-transfer";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

// Dưới thông tin chuyển khoản: hạn giữ hàng và nút "Tôi đã chuyển khoản" (báo kế toán đối chiếu).
export function TransferClaim({ token, deadlineText, claimedText }: { token: string; deadlineText: string | null; claimedText: string | null }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ ok?: boolean; message?: string } | null>(null);

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
      {deadlineText && !claimedText && (
        <p>
          Cửa hàng giữ hàng cho bạn tới <strong>{deadlineText}</strong>. Quá hạn mà chưa nhận được tiền thì đơn tự huỷ.
        </p>
      )}
      {claimedText ? (
        <Notice tone="success">Bạn đã báo chuyển khoản lúc {claimedText}. Cửa hàng đang đối chiếu và sẽ xác nhận sớm.</Notice>
      ) : open ? (
        <div className="space-y-2">
          <label htmlFor="transfer-note" className="block font-medium">
            Ghi chú cho cửa hàng (không bắt buộc)
          </label>
          <textarea
            id="transfer-note"
            maxLength={300}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ví dụ: chuyển từ Vietcombank lúc 20:15, tên NGUYEN VAN A"
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              pending={pending}
              onClick={() => startTransition(async () => setResult(await claimTransferAction(token, note)))}
            >
              Gửi báo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Đóng
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Tôi đã chuyển khoản
        </Button>
      )}
      {result?.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}
