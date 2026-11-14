import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseModelCard, parseRobotsFile } from "@/lib/recognition-import";

// Kiểm tra dữ liệu nhập cho nhận dạng robot (B10): robots.json thật của B1 và model card dạng B9.
const robotsFile = JSON.parse(readFileSync(path.join(process.cwd(), "ml/data/manifests/robots.json"), "utf8"));
const MEDIA = "https://media.example.com/storage/v1/object/public/media";

function card(overrides: Record<string, unknown> = {}) {
  return {
    id: "robotrec-convnext-tiny-dff6fdbb-s42",
    label: "ConvNeXt-Tiny (hạt giống 42)",
    arch: "convnext_tiny",
    dataset_version: "dff6fdbb77c03329",
    classes: 3,
    input: { size: 224, resize_short_side: 256, interpolation: "bilinear", crop: "center", mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
    temperature: 0.85,
    thresholds: [0.62, 0.55, 0.8],
    variant: "fp16",
    files: [
      { name: "model.part00.onnx", bytes: 47185920, sha256: "a".repeat(64) },
      { name: "model.part01.onnx", bytes: 8861289, sha256: "b".repeat(64) },
    ],
    mb: 53.45,
    metrics: { top1: 0.8 },
    ...overrides,
  };
}

const slugs = robotsFile.classes.slice(0, 3).map((c: { slug: string }) => c.slug);
const labels = (list = slugs) => list.map((slug: string, index: number) => ({ index, slug, name: slug, character: slug, franchise: "transformers", series: "G1" }));

describe("robots.json của B1", () => {
  it("nhận đủ 230 robot, lấy tên hiển thị, ảnh, nguồn wiki, gợi ý sản phẩm", () => {
    const { value, errors } = parseRobotsFile(robotsFile);
    expect(errors).toEqual([]);
    expect(value).toHaveLength(230);
    const arcee = value!.find((r) => r.slug === "transformers-arcee-g1")!;
    expect(arcee).toMatchObject({ name: "Arcee (G1)", character: "Arcee", franchise: "transformers", franchiseLabel: "Transformers", faction: "Autobot" });
    expect(arcee.image).toMatch(/^https:\/\//);
    expect(arcee.sourceUrl).toBe("https://tfwiki.net/wiki/Arcee_(G1)");
    expect(arcee.storeProducts).toEqual(["alliance-arcee"]);
    expect(value!.every((r) => r.description.length <= 4000)).toBe(true);
  });

  it("từ chối file sai dạng, slug trùng hoặc sai, ảnh không phải https", () => {
    expect(parseRobotsFile({ robots: [] }).errors[0]).toMatch(/classes/);
    const bad = parseRobotsFile({ classes: [{ slug: "a-b", name: "A", franchise: "x" }, { slug: "a-b", name: "B", franchise: "x" }, { slug: "Sai Slug", name: "C", franchise: "x" }] });
    expect(bad.value).toBeNull();
    expect(bad.errors.join("\n")).toMatch(/trùng/);
    expect(bad.errors.join("\n")).toMatch(/không hợp lệ/);
    const unsafe = parseRobotsFile({ classes: [{ slug: "a", name: "A", franchise: "x", image: { url: "javascript:alert(1)" }, wiki: { url: "http://x" } }] });
    expect(unsafe.value![0].image).toBeNull();
    expect(unsafe.value![0].sourceUrl).toBeNull();
  });
});

describe("model-card.json và labels.json của B9", () => {
  const robotSlugs = new Set<string>(slugs);

  it("card hợp lệ: ghép đường dẫn file dưới kho media, giữ nhiệt độ, ngưỡng, nhãn", () => {
    const { value, errors } = parseModelCard(card(), labels(), { mediaBase: `${MEDIA}/`, robotSlugs });
    expect(errors).toEqual([]);
    expect(value!.files).toEqual([`${MEDIA}/ml/robotrec-convnext-tiny-dff6fdbb-s42/model.part00.onnx`, `${MEDIA}/ml/robotrec-convnext-tiny-dff6fdbb-s42/model.part01.onnx`]);
    expect(value!.input).toEqual({ size: 224, resize: 256, mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] });
    expect(value!.thresholds).toEqual([0.62, 0.55, 0.8]);
    expect(value!.labels.map((l) => l.index)).toEqual([0, 1, 2]);
  });

  it("từ chối: chưa có ngưỡng (chưa chạy B8), số nhãn lệch số lớp, nhãn trỏ tới robot chưa nhập", () => {
    const opts = { mediaBase: MEDIA, robotSlugs };
    expect(parseModelCard(card({ thresholds: null }), labels(), opts).errors.join()).toMatch(/B8/);
    expect(parseModelCard(card({ classes: 4 }), labels(), opts).errors.join()).toMatch(/4 lớp/);
    expect(parseModelCard(card(), labels([...slugs.slice(0, 2), "robot-chua-nhap"]), opts).errors.join()).toMatch(/robot-chua-nhap/);
  });

  it("từ chối tên file thoát khỏi thư mục mô hình, tiền xử lý khác lúc huấn luyện, thiếu MEDIA_BASE_URL", () => {
    const opts = { mediaBase: MEDIA, robotSlugs };
    const escape = card({ files: [{ name: "../../khac/model.onnx", bytes: 1, sha256: "a".repeat(64) }] });
    expect(parseModelCard(escape, labels(), opts).value).toBeNull();
    expect(parseModelCard(card({ input: { ...card().input, interpolation: "bicubic" } }), labels(), opts).errors.join()).toMatch(/song tuyến/);
    expect(parseModelCard(card(), labels(), { mediaBase: "", robotSlugs }).errors[0]).toMatch(/MEDIA_BASE_URL/);
    expect(parseModelCard(card({ thresholds: [0.5, 0.5, 2] }), labels(), opts).errors.join()).toMatch(/1,01/);
  });
});
