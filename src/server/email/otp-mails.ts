import "server-only";
import type { OtpPurpose } from "../repo/otp";
import { sendMail } from "./mailer";
import { layout } from "./templates";

// Thư gửi mã OTP (nghiep-vu-ban-hang mục 15). Không bao giờ ném lỗi: thư lỗi chỉ ghi ở hộp thư đi.
export async function sendOtpMail(email: string, code: string, purpose: OtpPurpose): Promise<void> {
  try {
    const what = purpose === "verify_email" ? "xác thực email tài khoản" : "xác nhận đơn hàng thanh toán khi nhận hàng";
    const mail = layout({
      title: `Mã xác thực: ${code}`,
      paragraphs: [
        `Mã ${what} của bạn là ${code}.`,
        "Mã có hiệu lực trong 10 phút và chỉ dùng được một lần. Không chia sẻ mã này với bất kỳ ai, kể cả nhân viên cửa hàng.",
        "Nếu bạn không yêu cầu mã này, hãy bỏ qua thư.",
      ],
    });
    await sendMail({ to: email, kind: "otp", ref: `${purpose}:${email}`, subject: `${code} là mã xác thực ROBOTICA`, ...mail });
  } catch (error) {
    console.error("[email] Không gửi được thư OTP", purpose, error);
  }
}
