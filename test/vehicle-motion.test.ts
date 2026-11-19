import { describe, expect, it } from "vitest";
import { pickGuns, pickRotors, pickWheels, vehicleActions, vehicleKind } from "@/lib/vehicle-motion";

// Chuyển động dạng xe tự dựng (src/lib/vehicle-motion.ts): chọn xương theo tên có trong file .glb và nút theo loại xe.
describe("chuyển động dạng xe", () => {
  it("xếp loại xe theo tên dạng xe đã khai báo", () => {
    expect(vehicleKind("Xe tải pháo")).toBe("ground");
    expect(vehicleKind("Mô tô")).toBe("ground");
    expect(vehicleKind("Máy bay")).toBe("air");
    expect(vehicleKind("Tàu con thoi")).toBe("air");
    expect(vehicleKind("Trực thăng")).toBe("heli");
    for (const beast of ["Khủng long", "Khỉ đột", "Thằn lằn bay", "Ong bắp cày"]) expect(vehicleKind(beast)).toBe("beast");
  });

  it("chọn bánh xe, bỏ tấm chắn và phần phụ của bánh", () => {
    expect(pickWheels(["Bone_wheelfront_L", "Bone L Wheel Shield", "bn_l_backwheel", "bn_l_backwheel_part", "Tire_F_R", "Bone_Gun"])).toEqual([
      "Bone_wheelfront_L",
      "bn_l_backwheel",
      "Tire_F_R",
    ]);
  });

  it("chọn tối đa hai nòng súng, ưu tiên điểm đầu nòng, bỏ vũ khí cận chiến, đạn, chất liệu", () => {
    expect(pickGuns(["bn_r_weapon_melee", "bn_l_weapon_bullets", "Bone_Gun", "bn_barrel_end", "ZFweaponL_Material #"])).toEqual([
      "bn_barrel_end",
      "Bone_Gun",
    ]);
    expect(pickGuns(["Bone_Gun_L", "Bone_Gun", "Bone_Gun_R"])).toHaveLength(2);
    expect(pickGuns(["Bone_wheelleft"])).toEqual([]);
  });

  it("chọn cánh quạt trực thăng", () => {
    expect(pickRotors(["Bone_Propeller", "Bone_Gun"])).toEqual(["Bone_Propeller"]);
  });

  it("nút theo loại: xe chạy đất có Nghỉ, Chạy, Bắn; máy bay có Bay; thú chỉ có Nghỉ", () => {
    const labels = (list: { label: string }[]) => list.map((item) => item.label);
    expect(labels(vehicleActions("ground", { idle: true, guns: 1 }))).toEqual(["Nghỉ", "Chạy", "Bắn"]);
    expect(labels(vehicleActions("air", { idle: true, guns: 2 }))).toEqual(["Nghỉ", "Bay", "Bắn"]);
    expect(labels(vehicleActions("heli", { idle: false, guns: 0 }))).toEqual(["Nghỉ", "Bay"]);
    expect(labels(vehicleActions("beast", { idle: true, guns: 1 }))).toEqual(["Nghỉ"]);
    expect(vehicleActions("beast", { idle: false, guns: 0 })).toEqual([]);
  });
});

describe("nút và chú thích theo từng mô hình", () => {
  it("Combaticon và mẫu Alliance có dạng xe; bộ hợp thể và mẫu không biến hình thì không", async () => {
    const { MODEL_FEATURES, vehicleKindOf } = await import("@/lib/model-features");
    expect(vehicleKindOf(MODEL_FEATURES.onslaught)).toBe("ground");
    expect(vehicleKindOf(MODEL_FEATURES.vortex)).toBe("heli");
    expect(vehicleKindOf(MODEL_FEATURES["alliance-starscream"])).toBe("air");
    expect(vehicleKindOf(MODEL_FEATURES.shockwave)).toBe("air");
    expect(vehicleKindOf(MODEL_FEATURES.slag)).toBe("beast");
    expect(vehicleKindOf(MODEL_FEATURES.devastator)).toBe("group");
    expect(vehicleKindOf(MODEL_FEATURES.bruticus)).toBeNull();
    expect(vehicleKindOf(MODEL_FEATURES.grimlock)).toBeNull();
  });

  it("dáng đứng của Alliance chỉ phát lặp khi là clip đứng yên; các dáng khác đều phát lặp; Combaticon đứng yên", async () => {
    const { MODEL_FEATURES } = await import("@/lib/model-features");
    expect(MODEL_FEATURES.jetfire.poses?.[0]).toMatchObject({ label: "Đứng", clip: "idle01", play: true });
    expect(MODEL_FEATURES.hound.poses?.[0].play).toBeUndefined();
    expect(MODEL_FEATURES.hound.poses?.slice(1).every((pose) => pose.play)).toBe(true);
    expect(MODEL_FEATURES.onslaught.poses?.every((pose) => !pose.play)).toBe(true);
  });

  it("chú thích ghi rõ chuyển động dạng xe là tự dựng, trừ dạng thú", async () => {
    const { MODEL_FEATURES, viewerHint } = await import("@/lib/model-features");
    expect(viewerHint(MODEL_FEATURES.onslaught)).toMatch(/do cửa hàng tự dựng/);
    expect(viewerHint(MODEL_FEATURES.slag)).not.toMatch(/tự dựng/);
    expect(viewerHint(MODEL_FEATURES.bruticus)).toMatch(/Hợp thể/);
    expect(viewerHint(null)).toBe("Kéo để xoay, giữ Ctrl và cuộn để phóng to.");
  });
});
