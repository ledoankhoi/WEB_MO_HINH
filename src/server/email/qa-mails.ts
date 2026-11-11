import "server-only";
import { site } from "@/config/site";
import { getDb } from "../db";
import { getBaseUrl } from "../request";
import { sendMail } from "./mailer";
import { layout } from "./templates";

// Báo khách khi cửa hàng trả lời câu hỏi của họ (nghiep-vu-ban-hang mục 11). Không bao giờ ném lỗi.
export async function notifyQuestionAnswered(input: { askerId: string; productSlug: string; productName: string; answer: string }): Promise<void> {
  try {
    const db = await getDb();
    const user = (await db.execute({ sql: "SELECT email, name FROM users WHERE id = ? AND is_active", args: [input.askerId] })).rows[0];
    if (!user) return;
    const base = await getBaseUrl(site.url);
    const mail = layout({
      title: "Cửa hàng đã trả lời câu hỏi của bạn",
      paragraphs: [`Chào ${String(user.name)},`, `ROBOTICA đã trả lời câu hỏi của bạn về “${input.productName}”:`, input.answer],
      action: { label: "Xem hỏi đáp", url: `${base}/san-pham/${input.productSlug}#danh-gia` },
    });
    await sendMail({ to: String(user.email), kind: "qa", ref: `${input.askerId}:${input.productSlug}:${Date.now()}`, subject: `Đã trả lời câu hỏi về ${input.productName}`, ...mail });
  } catch (error) {
    console.error("[email] Không gửi được thư hỏi đáp", error);
  }
}
