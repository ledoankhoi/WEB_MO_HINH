import { describe, expect, it } from "vitest";
import golden from "./fixtures/recognition-golden.json";
import { buildHierarchy, recognize, softmax, type RecognitionLabel } from "@/lib/recognition";

// Bộ ca mẫu sinh từ mã Python của B8 (ml/scripts/xuat_mau_web.py): mã của web phải cho đúng cùng câu trả lời.
const labels = golden.labels as RecognitionLabel[];
const thresholds = golden.thresholds as [number, number, number];

describe("nhận dạng robot (src/lib/recognition.ts) khớp mã Python của B8", () => {
  const hierarchy = buildHierarchy(labels);

  it("cây nhãn cùng thứ tự nhân vật và franchise với Python", () => {
    expect(hierarchy.characters.map((c) => c.name)).toEqual(golden.characters);
    expect(hierarchy.franchises).toEqual(golden.franchises);
  });

  it.each(golden.cases.map((c, i) => [i, c] as const))("ca %i: cùng cấp trả lời, cùng lớp/nhân vật/franchise, cùng xác suất", (_, c) => {
    const result = recognize(c.logits, hierarchy, golden.temperature, thresholds);
    expect(result.level).toBe(c.level);
    expect(result.classIndex).toBe(c.classIndex);
    expect(result.characterIndex).toBe(c.characterIndex);
    expect(result.franchiseIndex).toBe(c.franchiseIndex);
    expect(result.pClass).toBeCloseTo(c.pClass, 10);
    expect(result.pCharacter).toBeCloseTo(c.pCharacter, 10);
    expect(result.pFranchise).toBeCloseTo(c.pFranchise, 10);
    expect(result.alternatives.map((a) => a.index)).toEqual(c.top5);
  });

  it("softmax với nhiệt độ: tổng bằng 1, T nhỏ làm phân bố nhọn hơn", () => {
    const plain = softmax([2, 1, 0]);
    const sharp = softmax([2, 1, 0], 0.5);
    expect(plain.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(sharp[0]).toBeGreaterThan(plain[0]);
    expect(softmax([1000, 0])[0]).toBe(1); // không tràn số
  });

  it("từ chối đầu vào sai kích thước", () => {
    expect(() => recognize([1, 2, 3], hierarchy, 1, thresholds)).toThrow();
  });
});
