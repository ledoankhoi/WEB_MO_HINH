"use client";

import { useState, useTransition } from "react";
import { payAgainAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

// Khối thanh toán VNPay ở trang đơn: kết quả lần vừa trả (đọc từ URL, chỉ để hiển thị) và nút thanh toán (lại).
// `amountLabel`: khoản sắp trả (tiền cọc, phần còn lại...) nếu khác cả đơn.
export function VnpayPanel({ token, unpaid, result, message, sandbox, amountLabel }: { token: string; unpaid: boolean; result: string; message: string; sandbox: boolean; amountLabel?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5 text-sm">
      {result === "paid" && <Notice tone="success">Thanh toán VNPay thành công. Cảm ơn bạn!</Notice>}
      {result === "pending" && unpaid && <Notice tone="info">Đang chờ VNPay xác nhận giao dịch. Tải lại trang sau ít phút.</Notice>}
      {result === "failed" && unpaid && <Notice tone="error">Thanh toán chưa thành công{message ? `: ${message}` : "."} Bạn có thể thử lại.</Notice>}
      {result === "invalid" && <Notice tone="error">Không xác minh được kết quả trả về. Nếu đã bị trừ tiền, cửa hàng sẽ kiểm tra và liên hệ bạn.</Notice>}
      {unpaid && (
        <>
          <p>
            Đơn chọn thanh toán qua <strong>VNPay</strong> (thẻ ATM, QR ngân hàng, thẻ quốc tế). Mỗi lần thanh toán có hiệu lực 15 phút.
          </p>
          {sandbox && <p className="text-xs text-muted">Đang chạy môi trường thử (sandbox): không trừ tiền thật.</p>}
          <Button
            pending={pending}
            onClick={() =>
              startTransition(async () => {
                const reply = await payAgainAction(token);
                if (reply.payUrl) window.location.assign(reply.payUrl);
                else setError(reply.message ?? "Không mở được cổng thanh toán.");
              })
            }
          >
            {amountLabel ? `Thanh toán ${amountLabel} qua VNPay` : "Thanh toán qua VNPay"}
          </Button>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </>
      )}
    </section>
  );
}
