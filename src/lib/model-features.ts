// Khả năng tương tác của từng mô hình .glb, tra theo tên file (trùng với slug sản phẩm mẫu).
// Mô hình không có trong bảng vẫn xem và xoay được, chỉ không có nút đổi dạng và chọn dáng.

export type ModelPose = {
  label: string;
  // Tên clip hoạt ảnh trong file .glb và vị trí trong clip (0 = đầu, 1 = cuối).
  clip: string;
  at: number;
};

export type ModelFeatures = {
  // Clip chạy từ dạng `from` sang dạng `to`. Nút đổi dạng phát clip này xuôi hoặc ngược.
  transform?: {
    kind: "transform" | "combine";
    clip: string;
    from: string;
    to: string;
  };
  poses?: ModelPose[];
  // Bộ hợp thể: slug các sản phẩm thành viên, và ngược lại slug của dạng hợp thể.
  members?: string[];
  combinesInto?: string;
};

// Các mô hình Transformers Alliance dùng chung bộ tên clip. Bốn dáng kinh điển; file nào thiếu clip thì
// dáng đó tự bị bỏ (ví dụ Megatron, Starscream không có clip thủ thế).
function alliance(extra: Partial<Record<"idle" | "win" | "transform", string>> = {}): ModelFeatures {
  return {
    transform: { kind: "transform", clip: extra.transform ?? "transform_r", from: "Dạng xe", to: "Dạng robot" },
    poses: [
      { label: "Đứng", clip: extra.idle ?? "idle01", at: 0 },
      { label: "Thủ thế", clip: "guard", at: 0.5 },
      { label: "Tấn công", clip: "attack01", at: 0.45 },
      { label: "Chiến thắng", clip: extra.win ?? "emo_joyful", at: 0.5 },
    ],
  };
}

// Thành viên Combaticons (Earth Wars G2). Dùng clip thường (biến hình tại chỗ); bản `_hero` cho xe bay
// vào từ xa nên dạng xe nằm ngoài khung nhìn.
function combaticon(clip: string, from: string): ModelFeatures {
  return { transform: { kind: "transform", clip, from, to: "Dạng robot" }, combinesInto: "bruticus" };
}

export const MODEL_FEATURES: Record<string, ModelFeatures> = {
  bruticus: {
    transform: { kind: "combine", clip: "transform_to_main_hero", from: "5 thành viên", to: "Bruticus" },
    members: ["onslaught", "brawl", "swindle", "vortex", "blast-off"],
  },
  onslaught: combaticon("transform_to_main", "Xe tải pháo"),
  brawl: combaticon("transform_to_robot", "Xe tăng"),
  swindle: combaticon("transform_to_robot", "Xe địa hình"),
  vortex: combaticon("transform_to_main", "Trực thăng"),
  "blast-off": combaticon("transform_to_main", "Tàu con thoi"),
  "alliance-optimus-prime": alliance({ idle: "idle02" }),
  "alliance-megatron": alliance({ win: "emo_joy" }),
  // Clip đứng yên và chiến thắng của Starscream quay ngang người; khung đầu của clip vui mừng thì nhìn thẳng.
  "alliance-starscream": alliance({ transform: "transform_r_Garage", idle: "emo_joyful" }),
  "alliance-bumblebee": alliance({ win: "emo_joy" }),
  // File Soundwave có clip biến hình, đứng yên và tấn công bị xoay nằm ngang; chỉ dùng các clip hiển thị đúng.
  "alliance-soundwave": {
    poses: [
      { label: "Đứng", clip: "emo_joyful", at: 0 },
      { label: "Chiến thắng", clip: "emo_joyful", at: 0.5 },
      { label: "Giận dữ", clip: "emo_rage", at: 0.55 },
    ],
  },
};

// Tên file của các mô hình có clip biến hình hoặc hợp thể (bộ lọc "Có biến hình 3D" của cửa hàng).
export const TRANSFORMABLE_MODEL_KEYS: readonly string[] = Object.entries(MODEL_FEATURES)
  .filter(([, features]) => features.transform)
  .map(([key]) => key);

// Biểu thức chính quy (cú pháp PostgreSQL) khớp cột model_url của các mô hình trên. Tên file chỉ gồm chữ thường,
// số và gạch ngang nên không cần thoát ký tự.
export const TRANSFORMABLE_MODEL_URL_PATTERN = "/models/(" + TRANSFORMABLE_MODEL_KEYS.join("|") + ")\\.glb$";

// Nhãn 3D trên thẻ sản phẩm: "Hợp thể 3D", "Biến hình 3D" hoặc không có.
export function transformLabel(modelUrl: string | null | undefined): string | null {
  const transform = getModelFeatures(modelUrl)?.transform;
  if (!transform) return null;
  return transform.kind === "combine" ? "Hợp thể 3D" : "Biến hình 3D";
}

// "/models/bruticus.glb" hoặc đường dẫn đầy đủ trên kho media đều cho ra "bruticus".
export function modelKey(modelUrl: string | null | undefined): string | null {
  return modelUrl?.match(/\/models\/([^/]+)\.glb$/)?.[1] ?? null;
}

export function getModelFeatures(modelUrl: string | null | undefined): ModelFeatures | null {
  const key = modelKey(modelUrl);
  return key ? (MODEL_FEATURES[key] ?? null) : null;
}
