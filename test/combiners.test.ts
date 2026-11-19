import { describe, expect, it } from "vitest";
import { MODEL_FEATURES } from "@/lib/model-features";

// Bộ hợp thể (src/lib/model-features.ts): trang của dạng ghép liệt kê thành viên ("Hoặc mua lẻ từng thành viên"), trang
// của thành viên trỏ về dạng ghép ("Hợp thể thành"). Hai chiều phải khớp nhau.
describe("bộ hợp thể", () => {
  it("cả năm bộ hợp thể đều có đủ thành viên", () => {
    const sizes = Object.fromEntries(
      ["bruticus", "devastator", "menasor", "defensor", "volcanicus"].map((slug) => [slug, MODEL_FEATURES[slug].members?.length]),
    );
    expect(sizes).toEqual({ bruticus: 5, devastator: 6, menasor: 5, defensor: 5, volcanicus: 5 });
  });

  it("mỗi thành viên trỏ về đúng dạng ghép, và mỗi thành viên khai báo combinesInto đều nằm trong danh sách của dạng ghép", () => {
    for (const [slug, features] of Object.entries(MODEL_FEATURES)) {
      for (const member of features.members ?? []) expect(MODEL_FEATURES[member]?.combinesInto, `${member} → ${slug}`).toBe(slug);
      if (features.combinesInto) expect(MODEL_FEATURES[features.combinesInto]?.members, `${slug}`).toContain(slug);
    }
  });
});
