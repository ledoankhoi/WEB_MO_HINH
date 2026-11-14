// Nhập dữ liệu nhận dạng vào CSDL DATABASE_URL bằng đúng hàm của trang quản trị /admin/nhan-dien (B10):
// robots.json (B1), model-card.json + labels.json (gói B9), ghép sản phẩm theo gợi ý của B1, tuỳ chọn bật mô hình.
// File mô hình phải đã nằm trên Storage (media/ml/<mã mô hình>/). Chạy: node scripts/recognition-import.mjs <thư mục gói> [--activate]
// hoặc node scripts/recognition-import.mjs --delete <mã mô hình>
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { parseModelCard, parseRobotsFile } from "@/lib/recognition-import";
import type { AuditEntry } from "@/server/repo/audit";
import { applySuggestedLinks, deleteModel, listModels, listRobotSlugs, saveModel, setActiveModel, upsertRobots } from "@/server/repo/recognition";

const SYSTEM = (action: string, entity: string, summary: string, entityId?: string): AuditEntry => ({
  actor: { id: null, role: "system" }, action, entity, entityId, summary: `${summary} (script nhập nhận dạng)`,
});
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf-8"));

it("nhập robot, mô hình nhận dạng", async () => {
  const remove = process.env.RECOGNITION_DELETE;
  if (remove) {
    // Xoá một mô hình không còn dùng (mô hình đang bật thì repo từ chối). File trên Storage xoá riêng.
    const done = await deleteModel(remove, SYSTEM("recognition.model.delete", "recognition_models", `Xoá mô hình nhận dạng ${remove}`));
    console.log(done ? `Đã xoá ${remove}` : `Không xoá được ${remove} (đang bật hoặc không có)`);
    return;
  }
  const dir = process.env.RECOGNITION_PACKAGE;
  if (!dir) throw new Error("Thiếu RECOGNITION_PACKAGE (thư mục goi/ của B9)");
  const robots = parseRobotsFile(readJson(path.resolve("ml/data/manifests/robots.json")));
  expect(robots.errors).toEqual([]);
  const { created, updated } = await upsertRobots(robots.value!, SYSTEM("recognition.robots.import", "robots", `Nhập ${robots.value!.length} robot từ robots.json`));
  console.log(`Robot: ${robots.value!.length} (${created} mới, ${updated} cập nhật)`);
  const links = await applySuggestedLinks(SYSTEM("recognition.links.suggest", "robot_products", "Ghép robot với sản phẩm theo gợi ý của B1"));
  console.log(`Ghép sản phẩm theo gợi ý: thêm ${links}`);

  const parsed = parseModelCard(readJson(path.join(dir, "model-card.json")), readJson(path.join(dir, "labels.json")), {
    mediaBase: process.env.MEDIA_BASE_URL ?? "", robotSlugs: await listRobotSlugs(),
  });
  expect(parsed.errors).toEqual([]);
  const model = parsed.value!;
  const exists = (await listModels()).some((m) => m.id === model.id);
  if (!exists) await saveModel(model, SYSTEM("recognition.model.import", "recognition_models", `Nhập mô hình nhận dạng ${model.label} (${model.id})`, model.id));
  console.log(`Mô hình ${model.id}: ${exists ? "đã có, giữ nguyên" : "đã nhập"} (${model.labels.length} lớp, ${model.files.length} phần, ${model.mb} MB)`);
  // Kiểm tra mọi phần tải được từ kho công khai, đúng kích thước
  for (const url of model.files) {
    const res = await fetch(url, { method: "HEAD" });
    expect(res.status, url).toBe(200);
  }
  if (process.env.RECOGNITION_ACTIVATE === "1") {
    await setActiveModel(model.id, SYSTEM("recognition.model.activate", "recognition_models", `Bật mô hình nhận dạng ${model.id}`, model.id));
    console.log(`Đã bật ${model.id}`);
  }
});
