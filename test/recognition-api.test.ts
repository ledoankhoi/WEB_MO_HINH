import { describe, expect, it } from "vitest";
import { buildHierarchy, type RecognitionLabel } from "@/lib/recognition";
import { buildRecognitionResponse, mergeProducts, parseClientMs, parseProbabilities, roundProbability } from "@/lib/recognition-api";
import type { ProductSummary } from "@/lib/types";

const labels: RecognitionLabel[] = [
  { index: 0, slug: "tf-optimus-g1", name: "Optimus Prime (G1)", character: "Optimus Prime", franchise: "transformers", series: "Generation 1" },
  { index: 1, slug: "tf-optimus-movie", name: "Optimus Prime (Movie)", character: "Optimus Prime", franchise: "transformers", series: "Live-action film" },
  { index: 2, slug: "tf-megatron-g1", name: "Megatron (G1)", character: "Megatron", franchise: "transformers", series: "Generation 1" },
  { index: 3, slug: "gd-rx78", name: "RX-78-2 Gundam", character: "RX-78-2 Gundam", franchise: "gundam", series: "Universal Century" },
  { index: 4, slug: "gd-zaku", name: "Zaku II", character: "Zaku II", franchise: "gundam", series: "Universal Century" },
];
const hierarchy = buildHierarchy(labels);
const model = { id: "m1", labels, thresholds: [0.6, 0.6, 0.8] as [number, number, number], temperature: 1 };
const product = (id: string) => ({ id, name: id }) as unknown as ProductSummary;
const catalog = {
  robots: {
    "tf-optimus-g1": { name: "Optimus Prime (G1)", franchise: "transformers", franchiseLabel: "Transformers", faction: "Autobot", sourceUrl: "https://tfwiki.net/wiki/Optimus_Prime_(G1)" },
    "gd-rx78": { franchise: "gundam", franchiseLabel: "Gundam" },
  },
  products: { "tf-optimus-g1": [product("p1"), product("p2")], "tf-optimus-movie": [product("p2"), product("p3")], "gd-zaku": [product("p9")] },
};

describe("POST /api/nhan-dien: kiểm tra đầu vào", () => {
  it("nhận đúng số lớp, mỗi số trong [0; 1], tổng gần 1", () => {
    expect(parseProbabilities([0.2, 0.2, 0.2, 0.2, 0.2], 5)).toEqual([0.2, 0.2, 0.2, 0.2, 0.2]);
    expect(parseProbabilities([0.2, 0.2, 0.2, 0.2], 5)).toBeNull();
    expect(parseProbabilities([0.5, 0.5, 0.5, 0, 0], 5)).toBeNull(); // tổng 1,5
    expect(parseProbabilities([1.2, -0.2, 0, 0, 0], 5)).toBeNull();
    expect(parseProbabilities([0.2, 0.2, 0.2, 0.2, "0.2"], 5)).toBeNull();
    expect(parseProbabilities([0.2, 0.2, 0.2, 0.2, Number.NaN], 5)).toBeNull();
    expect(parseProbabilities("[0.2]", 1)).toBeNull();
    expect(parseProbabilities([0.333333, 0.333333, 0.333333], 3)).not.toBeNull(); // làm tròn 6 chữ số vẫn nhận
  });

  it("làm tròn xác suất và kẹp thời gian của khách", () => {
    expect(roundProbability(0.12345678)).toBe(0.123457);
    expect(parseClientMs(12.6)).toBe(13);
    expect(parseClientMs(-5)).toBe(0);
    expect(parseClientMs(1e9)).toBe(600_000);
    expect(parseClientMs("10")).toBeNull();
  });

  it("gộp sản phẩm, bỏ trùng, giới hạn số lượng", () => {
    expect(mergeProducts([[product("a"), product("b")], undefined, [product("b"), product("c")]]).map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(mergeProducts([[product("a"), product("b"), product("c")]], 2).map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("POST /api/nhan-dien: câu trả lời theo cấp", () => {
  it("chắc chắn lớp: trả robot, sản phẩm của robot trước rồi tới các dòng cùng nhân vật", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.7, 0.1, 0.1, 0.05, 0.05], catalog);
    expect(response.level).toBe("class");
    expect(response.robot).toMatchObject({ slug: "tf-optimus-g1", faction: "Autobot", franchiseLabel: "Transformers" });
    expect(response.products.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(response.alternatives.map((a) => a.slug)).toEqual(["tf-optimus-movie", "tf-megatron-g1", "gd-rx78", "gd-zaku"]);
    expect(response.character).toEqual({ name: "Optimus Prime", p: 0.8 });
  });

  it("chỉ chắc nhân vật: sản phẩm của mọi dòng cùng nhân vật", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.4, 0.35, 0.15, 0.05, 0.05], catalog);
    expect(response.level).toBe("character");
    expect(response.character.name).toBe("Optimus Prime");
    expect(response.products.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("chỉ chắc thương hiệu: không gợi ý sản phẩm, nhãn thương hiệu lấy từ CSDL", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.05, 0.05, 0.05, 0.45, 0.4], catalog);
    expect(response.level).toBe("franchise");
    expect(response.franchise).toEqual({ key: "gundam", label: "Gundam", p: 0.85 });
    expect(response.products).toEqual([]);
  });

  it("không nhận ra: vẫn trả lớp gần nhất để hiện 'gần giống nhất', không sản phẩm", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.25, 0.1, 0.25, 0.2, 0.2], catalog);
    expect(response.level).toBe("none");
    expect(response.robot.slug).toBe("tf-optimus-g1");
    expect(response.products).toEqual([]);
  });

  it("robot chưa có trong CSDL: lấy tên và dòng từ labels của mô hình", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.02, 0.02, 0.9, 0.03, 0.03], catalog);
    expect(response.robot).toMatchObject({ slug: "tf-megatron-g1", name: "Megatron (G1)", series: "Generation 1", franchiseLabel: "Transformers", image: null });
  });
});
