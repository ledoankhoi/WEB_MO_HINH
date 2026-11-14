import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupTempDatabase } from "./helpers/temp-db";

// B10: nhập robot và mô hình nhận dạng, bật mô hình, ghép sản phẩm, nhật ký lượt nhận dạng (PGlite).
const { jar } = await vi.hoisted(async () => import("./helpers/staff"));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ refresh: () => {}, updateTag: () => {}, revalidateTag: () => {}, cacheTag: () => {}, cacheLife: () => {} }));

const cleanup = setupTempDatabase();
const { getDb } = await import("@/server/db");
const { createUser, signInAs } = await import("./helpers/staff");
const actions = await import("@/app/actions/recognition");
const repo = await import("@/server/repo/recognition");

const robotsJson = readFileSync(path.join(process.cwd(), "ml/data/manifests/robots.json"), "utf8");
const robotsData = JSON.parse(robotsJson);
const MEDIA = "https://media.example.com/storage/v1/object/public/media";

function fileForm(files: Record<string, string>) {
  const form = new FormData();
  for (const [name, content] of Object.entries(files)) form.set(name, new File([content], `${name}.json`, { type: "application/json" }));
  return form;
}

function modelFiles(id: string, slugs: string[]) {
  const card = {
    id, label: `Mô hình ${id}`, arch: "convnext_tiny", dataset_version: "dff6fdbb77c03329", classes: slugs.length, variant: "fp16",
    input: { size: 224, resize_short_side: 256, interpolation: "bilinear", crop: "center", mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
    temperature: 0.85, thresholds: [0.62, 0.55, 0.8], files: [{ name: "model.onnx", bytes: 1000, sha256: "c".repeat(64) }], mb: 53.4, metrics: { top1: 0.76 },
  };
  const labels = slugs.map((slug, index) => ({ index, slug, name: slug, character: slug, franchise: "transformers", series: "G1" }));
  return fileForm({ card: JSON.stringify(card), labels: JSON.stringify(labels) });
}

let managerId = "";
beforeAll(async () => {
  process.env.MEDIA_BASE_URL = MEDIA;
  await getDb();
  managerId = (await createUser("product_manager")).id;
});
afterAll(cleanup);

describe("nhận dạng robot: dữ liệu (B10)", () => {
  it("nhân viên không có quyền catalog.edit không nhập được", async () => {
    await signInAs((await createUser("marketing")).id);
    const result = await actions.importRobotsAction({}, fileForm({ file: robotsJson }));
    expect(result.message).toMatch(/không có quyền/);
    expect(await repo.listRobots()).toEqual([]);
  });

  it("nhập robots.json: 230 robot mới; nhập lại thì chỉ cập nhật, không nhân đôi; ghi nhật ký", async () => {
    await signInAs(managerId);
    const first = await actions.importRobotsAction({}, fileForm({ file: robotsJson }));
    expect(first).toMatchObject({ ok: true, message: expect.stringContaining("230 mới") });
    const again = await actions.importRobotsAction({}, fileForm({ file: robotsJson }));
    expect(again.message).toMatch(/0 mới, 230 cập nhật/);
    expect(await repo.listRobots()).toHaveLength(230);
    const db = await getDb();
    const logs = await db.execute("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'recognition.robots.import'");
    expect(Number(logs.rows[0].n)).toBe(2);
  });

  it("file sai thì không ghi gì", async () => {
    const result = await actions.importRobotsAction({}, fileForm({ file: '{"classes": [{"slug": "Sai"}]}' }));
    expect(result.errors?.file).toMatch(/không hợp lệ/);
    expect(await repo.listRobots()).toHaveLength(230);
  });

  it("ghép theo gợi ý của B1 chỉ ghép sản phẩm có thật; chạy lại không ghép trùng; gỡ một cặp", async () => {
    const first = await actions.applySuggestionsAction();
    expect(first.message).toMatch(/Đã ghép thêm \d+ cặp/);
    const robots = await repo.listRobots();
    const arcee = robots.find((r) => r.slug === "transformers-arcee-wfc")!; // gợi ý của B1: sản phẩm "arcee" (có trong dữ liệu mẫu)
    expect(arcee.storeProducts).toEqual(["arcee"]);
    expect(arcee.productIds).toHaveLength(1);
    // Gợi ý trỏ tới sản phẩm chỉ có trên CSDL thật (alliance-arcee) thì bỏ qua, không lỗi
    expect(robots.find((r) => r.slug === "transformers-arcee-g1")!.productIds).toEqual([]);
    expect((await actions.applySuggestionsAction()).message).toMatch(/Không có cặp mới/);
    expect((await actions.linkProductAction(arcee.id, arcee.productIds[0], false)).ok).toBe(true);
    expect((await repo.listRobots()).find((r) => r.id === arcee.id)!.productIds).toEqual([]);
    expect((await actions.linkProductAction(arcee.id, arcee.productIds[0], true)).ok).toBe(true);
    expect((await actions.linkProductAction("x", arcee.productIds[0], true)).message).toMatch(/không hợp lệ/);
  });

  it("nhập mô hình; bật mô hình thứ hai thì mô hình thứ nhất tự tắt; không xoá được mô hình đang bật", async () => {
    const slugs = robotsData.classes.slice(0, 5).map((c: { slug: string }) => c.slug);
    expect((await actions.importModelAction({}, modelFiles("mo-hinh-a", slugs))).ok).toBe(true);
    expect((await actions.importModelAction({}, modelFiles("mo-hinh-a", slugs))).errors?.card).toMatch(/Đã có/);
    expect((await actions.importModelAction({}, modelFiles("mo-hinh-b", slugs))).ok).toBe(true);
    expect(await repo.findActiveModel()).toBeNull();

    expect((await actions.activateModelAction("mo-hinh-a")).ok).toBe(true);
    expect((await actions.activateModelAction("mo-hinh-b")).ok).toBe(true);
    const active = await repo.findActiveModel();
    expect(active).toMatchObject({ id: "mo-hinh-b", temperature: 0.85, thresholds: [0.62, 0.55, 0.8], files: [`${MEDIA}/ml/mo-hinh-b/model.onnx`] });
    expect(active!.labels.map((l) => l.slug)).toEqual(slugs);
    expect((await repo.listModels()).filter((m) => m.isActive).map((m) => m.id)).toEqual(["mo-hinh-b"]);
    expect((await actions.deleteModelAction("mo-hinh-b")).message).toMatch(/đang bật/);
    expect((await actions.deleteModelAction("mo-hinh-a")).ok).toBe(true);
    expect((await actions.activateModelAction("")).ok).toBe(true);
    expect(await repo.findActiveModel()).toBeNull();
    expect((await actions.activateModelAction("khong-co")).message).toMatch(/không còn/);
  });

  it("mô hình có nhãn trỏ tới robot chưa nhập bị từ chối", async () => {
    const result = await actions.importModelAction({}, modelFiles("mo-hinh-c", ["robot-chua-nhap"]));
    expect(result.errors?.card).toMatch(/robot-chua-nhap/);
  });

  it("nhật ký lượt nhận dạng: không có ảnh; thống kê theo cấp trả lời", async () => {
    await repo.logRecognition({ model: "mo-hinh-b", topRobotSlug: "transformers-arcee-g1", topProb: 0.91, level: "class", clientMs: 120 });
    await repo.logRecognition({ model: "mo-hinh-b", topRobotSlug: "khong-co", topProb: 0.2, level: "none", clientMs: 80 });
    const stats = await repo.recognitionStats(30);
    expect(stats).toMatchObject({ total: 2, byLevel: { class: 1, character: 0, franchise: 0, none: 1 } });
    expect(stats.avgTopProb).toBeCloseTo(0.555, 6);
    const db = await getDb();
    const columns = (await db.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'recognition_logs'")).rows.map((r) => r.column_name);
    expect(columns.some((c) => /image|photo|user|ip/.test(String(c)))).toBe(false);
    const products = await repo.listProductsForRobots([(await repo.listRobots()).find((r) => r.slug === "transformers-arcee-wfc")!.id]);
    expect([...products.values()][0][0].slug).toBe("arcee");
  });
});
