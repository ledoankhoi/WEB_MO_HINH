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

describe("POST /api/nhan-dien: bảng xếp hạng", () => {
  it("5 robot giảm dần theo xác suất, tên và thương hiệu lấy từ CSDL, thiếu thì từ labels", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.05, 0.1, 0.6, 0.15, 0.1], catalog);
    expect(response.model).toBe("m1");
    expect(response.ranking.map((r) => r.slug)).toEqual(["tf-megatron-g1", "gd-rx78", "tf-optimus-movie", "gd-zaku", "tf-optimus-g1"]);
    expect(response.ranking.map((r) => r.p)).toEqual([0.6, 0.15, 0.1, 0.1, 0.05]);
    // Megatron chưa có trong CSDL: tên, dòng lấy từ labels; nhãn thương hiệu lấy từ robot khác cùng thương hiệu trong CSDL
    expect(response.ranking[0]).toEqual({ slug: "tf-megatron-g1", name: "Megatron (G1)", series: "Generation 1", franchiseLabel: "Transformers", image: null, p: 0.6 });
    expect(response.ranking[1]).toMatchObject({ name: "RX-78-2 Gundam", franchiseLabel: "Gundam" });
  });

  it("hạng 1 luôn có trong bảng, kể cả khi xác suất thấp (trước đây bị bỏ mất ở cấp \"chưa nhận ra\")", () => {
    const { response, result } = buildRecognitionResponse(model, hierarchy, [0.25, 0.1, 0.24, 0.21, 0.2], catalog);
    expect(result.level).toBe("none");
    expect(response.ranking[0]).toMatchObject({ slug: "tf-optimus-g1", p: 0.25 });
    expect(response.ranking).toHaveLength(5);
  });

  it("sản phẩm của các robot trong bảng theo thứ hạng, bỏ trùng; robot không có sản phẩm thì bỏ qua", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.1, 0.3, 0.05, 0.05, 0.5], catalog);
    expect(response.ranking.map((r) => r.slug)).toEqual(["gd-zaku", "tf-optimus-movie", "tf-optimus-g1", "tf-megatron-g1", "gd-rx78"]);
    expect(response.products.map((p) => p.id)).toEqual(["p9", "p2", "p3", "p1"]);
  });

  it("vẫn tính luật theo cấp để ghi nhật ký, không gửi về trình duyệt", () => {
    const { response, result } = buildRecognitionResponse(model, hierarchy, [0.7, 0.1, 0.1, 0.05, 0.05], catalog);
    expect(result.level).toBe("class");
    expect(result.classIndex).toBe(0);
    expect(Object.keys(response).sort()).toEqual(["model", "products", "ranking"]);
  });

  it("bảng ngắn hơn khi yêu cầu", () => {
    const { response } = buildRecognitionResponse(model, hierarchy, [0.7, 0.1, 0.1, 0.05, 0.05], catalog, 3);
    expect(response.ranking.map((r) => r.slug)).toEqual(["tf-optimus-g1", "tf-optimus-movie", "tf-megatron-g1"]);
  });
});
