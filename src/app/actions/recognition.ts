"use server";

import { refresh, updateTag } from "next/cache";
import { parseModelCard, parseRobotsFile, SLUG } from "@/lib/recognition-import";
import type { FormState } from "@/lib/types";
import { RECOGNITION_TAG } from "@/server/recognition";
import {
  applySuggestedLinks,
  deleteModel,
  listRobotSlugs,
  saveModel,
  setActiveModel,
  setRobotProduct,
  upsertRobots,
} from "@/server/repo/recognition";
import { FORBIDDEN, isId, staffWith } from "@/server/staff-action";

// Trang quản trị /admin/nhan-dien (B10): nhập robots.json (B1), model-card.json + labels.json (B9), bật mô hình, ghép sản phẩm.
// Quyền catalog.edit như mọi thao tác trên danh mục; mọi thay đổi ghi audit_logs.

const MAX_JSON_BYTES = 900 * 1024; // dưới giới hạn 1 MB của Server Action

async function readJsonFile(form: FormData, name: string): Promise<{ data?: unknown; error?: string }> {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return { error: "Chưa chọn file." };
  if (file.size > MAX_JSON_BYTES) return { error: "File quá lớn (tối đa 900 KB)." };
  try {
    return { data: JSON.parse(await file.text()) };
  } catch {
    return { error: "File không phải JSON hợp lệ." };
  }
}

const errorList = (errors: string[]) => errors.slice(0, 8).join(" ");

export async function importRobotsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const { data, error } = await readJsonFile(form, "file");
  if (error) return { errors: { file: error } };
  const parsed = parseRobotsFile(data);
  if (!parsed.value) return { errors: { file: errorList(parsed.errors) }, message: "Không nhập được: file có lỗi, chưa ghi gì." };
  const { created, updated } = await upsertRobots(
    parsed.value,
    audit({ action: "recognition.robots.import", entity: "robots", summary: `Nhập ${parsed.value.length} robot từ robots.json` }),
  );
  updateTag(RECOGNITION_TAG);
  refresh();
  return { ok: true, message: `Đã nhập ${parsed.value.length} robot: ${created} mới, ${updated} cập nhật.` };
}

export async function importModelAction(_prev: FormState, form: FormData): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const [card, labels] = await Promise.all([readJsonFile(form, "card"), readJsonFile(form, "labels")]);
  if (card.error || labels.error) return { errors: { ...(card.error ? { card: card.error } : {}), ...(labels.error ? { labels: labels.error } : {}) } };
  const parsed = parseModelCard(card.data, labels.data, { mediaBase: process.env.MEDIA_BASE_URL ?? "", robotSlugs: await listRobotSlugs() });
  if (!parsed.value) return { errors: { card: errorList(parsed.errors) }, message: "Không nhập được: model card có lỗi, chưa ghi gì." };
  const model = parsed.value;
  const saved = await saveModel(
    model,
    audit({ action: "recognition.model.import", entity: "recognition_models", entityId: model.id, summary: `Nhập mô hình nhận dạng ${model.label} (${model.id})` }),
  );
  if (!saved) return { errors: { card: `Đã có mô hình mã ${model.id}.` } };
  updateTag(RECOGNITION_TAG);
  refresh();
  return { ok: true, message: `Đã nhập mô hình ${model.label}: ${model.labels.length} lớp, ${model.mb.toLocaleString("vi-VN")} MB. Mô hình chưa bật.` };
}

// `id` rỗng: tắt nhận dạng (khách không thấy trang nhận dạng nữa).
export async function activateModelAction(id: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (id !== "" && (!SLUG.test(id) || id.length > 100)) return { message: "Yêu cầu không hợp lệ." };
  const done = await setActiveModel(
    id || null,
    audit({ action: id ? "recognition.model.activate" : "recognition.model.deactivate", entity: "recognition_models", entityId: id || undefined,
            summary: id ? `Bật mô hình nhận dạng ${id}` : "Tắt nhận dạng robot" }),
  );
  if (!done) return { message: "Mô hình không còn tồn tại." };
  updateTag(RECOGNITION_TAG);
  refresh();
  return { ok: true, message: id ? "Đã bật mô hình; mô hình đang bật trước đó đã tắt." : "Đã tắt nhận dạng robot." };
}

export async function deleteModelAction(id: string): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!SLUG.test(id) || id.length > 100) return { message: "Yêu cầu không hợp lệ." };
  const done = await deleteModel(id, audit({ action: "recognition.model.delete", entity: "recognition_models", summary: `Xoá mô hình nhận dạng ${id}` }));
  if (!done) return { message: "Không xoá được: mô hình đang bật hoặc không còn tồn tại." };
  refresh();
  return { ok: true, message: "Đã xoá mô hình." };
}

export async function applySuggestionsAction(): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  const added = await applySuggestedLinks(audit({ action: "recognition.links.suggest", entity: "robot_products", summary: "Ghép robot với sản phẩm theo gợi ý của B1" }));
  updateTag(RECOGNITION_TAG);
  refresh();
  return { ok: true, message: added > 0 ? `Đã ghép thêm ${added} cặp robot–sản phẩm.` : "Không có cặp mới để ghép (đã ghép hết các gợi ý)." };
}

export async function linkProductAction(robotId: string, productId: string, linked: boolean): Promise<FormState> {
  const audit = await staffWith("catalog.edit");
  if (!audit) return FORBIDDEN;
  if (!isId(robotId) || !isId(productId) || typeof linked !== "boolean") return { message: "Yêu cầu không hợp lệ." };
  const done = await setRobotProduct(
    robotId,
    productId,
    linked,
    audit({ action: linked ? "recognition.link" : "recognition.unlink", entity: "robot_products", summary: `${linked ? "Ghép" : "Gỡ"} sản phẩm ${productId} với robot` }),
  );
  if (!done) return { message: linked ? "Không ghép được: robot hoặc sản phẩm không tồn tại, hoặc đã ghép." : "Cặp này chưa được ghép." };
  updateTag(RECOGNITION_TAG);
  refresh();
  return { ok: true };
}
