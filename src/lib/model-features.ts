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

// Các dáng có sẵn của bộ clip Transformers Alliance, mỗi dáng một thời điểm trong clip.
const ALLIANCE_POSES = {
  guard: { label: "Thủ thế", clip: "guard", at: 0.5 },
  attack: { label: "Tấn công", clip: "attack01", at: 0.45 },
  joyful: { label: "Chiến thắng", clip: "emo_joyful", at: 0.5 },
  rage: { label: "Giận dữ", clip: "emo_rage", at: 0.55 },
} satisfies Record<string, ModelPose>;

// Mô hình Transformers Alliance khai báo từng clip một. Danh sách dáng đã đo trên từng file (thân đứng thẳng, mặt
// lệch không quá 45° với dáng đứng, 60° với các dáng khác); clip bị xoay nằm hoặc quay ngang thì bỏ.
// `stand` là clip dáng đứng: clip đứng yên (`idle01`, `idle02`) hoặc khung đầu clip vui mừng khi clip đứng yên của
// file bị quay ngang. Không có dáng đứng đạt thì để null, khung xem mở đầu ở dáng đầu tiên trong `poses`.
function allianceModel(input: {
  from: string | null;
  transform?: string;
  stand: string | null;
  poses: (keyof typeof ALLIANCE_POSES)[];
}): ModelFeatures {
  const poses: ModelPose[] = input.stand ? [{ label: "Đứng", clip: input.stand, at: 0 }] : [];
  poses.push(...input.poses.map((key) => ALLIANCE_POSES[key]));
  return {
    ...(input.from ? { transform: { kind: "transform" as const, clip: input.transform ?? "transform_r", from: input.from, to: "Dạng robot" } } : {}),
    poses,
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

  // Các mẫu Alliance còn lại. Defensor và Menasor không có clip dạng xe (`vehicle_idle01`, `transform_v`) và clip
  // `transform_r` không mở đầu bằng dạng xe rõ ràng, nên chỉ có dáng.
  "alliance-arcee": allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  "alliance-grimlock": allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful"] }),
  blades: allianceModel({ from: "Trực thăng", stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  bonecrusher: allianceModel({ from: "Xe ủi", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  breakdown: allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  cliffjumper: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  "dead-end": allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  defensor: allianceModel({ from: null, stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  devastator: allianceModel({ from: "Dạng thay thế", transform: "transform_r_Garage", stand: "idle01", poses: ["joyful", "rage"] }),
  "drag-strip": allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  "first-aid": allianceModel({ from: "Xe cứu thương", stand: "emo_joyful", poses: ["joyful"] }),
  galvatron: allianceModel({ from: "Dạng thay thế", stand: "idle01", poses: ["guard", "joyful", "rage"] }),
  groove: allianceModel({ from: "Mô tô", stand: null, poses: ["rage", "guard"] }),
  hook: allianceModel({ from: "Xe cẩu", stand: "idle01", poses: ["attack", "joyful"] }),
  "hot-spot": allianceModel({ from: "Xe cứu hoả", stand: "idle01", poses: ["guard", "joyful", "rage"] }),
  hound: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  ironhide: allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  jazz: allianceModel({ from: "Dạng xe", stand: "idle02", poses: ["joyful"] }),
  jetfire: allianceModel({ from: "Máy bay", stand: "idle01", poses: ["attack", "rage"] }),
  "long-haul": allianceModel({ from: "Xe tải", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  menasor: allianceModel({ from: null, stand: "idle01", poses: ["joyful", "rage"] }),
  mixmaster: allianceModel({ from: "Xe trộn bê tông", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  motormaster: allianceModel({ from: "Xe đầu kéo", stand: "idle01", poses: ["guard", "joyful"] }),
  "optimus-primal": allianceModel({ from: "Khỉ đột", stand: "idle01", poses: ["joyful", "rage"] }),
  "predacon-megatron": allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful", "rage"] }),
  "rodimus-prime": allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["joyful", "rage"] }),
  scavenger: allianceModel({ from: "Xe xúc", stand: "emo_joyful", poses: ["attack", "joyful"] }),
  scrapper: allianceModel({ from: "Xe xúc lật", stand: "emo_joyful", poses: ["joyful"] }),
  shockwave: allianceModel({ from: "Dạng thay thế", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  skywarp: allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  slag: allianceModel({ from: "Khủng long", stand: "idle01", poses: ["attack", "joyful"] }),
  sludge: allianceModel({ from: "Khủng long", stand: "emo_joyful", poses: ["guard", "attack", "joyful", "rage"] }),
  snarl: allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful", "rage"] }),
  "star-saber": allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "idle02", poses: ["joyful"] }),
  streetwise: allianceModel({ from: "Xe cảnh sát", stand: null, poses: ["guard", "rage"] }),
  swoop: allianceModel({ from: "Thằn lằn bay", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  thundercracker: allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  "ultra-magnus": allianceModel({ from: "Xe đầu kéo", stand: "idle02", poses: ["guard", "attack", "joyful", "rage"] }),
  volcanicus: allianceModel({ from: "Dạng thay thế", stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  waspinator: allianceModel({ from: "Ong bắp cày", stand: "emo_joyful", poses: ["joyful"] }),
  wheeljack: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  wildrider: allianceModel({ from: "Dạng xe", stand: null, poses: ["guard", "attack", "joyful", "rage"] }),
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
