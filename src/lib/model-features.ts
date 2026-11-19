// Khả năng tương tác của từng mô hình .glb, tra theo tên file (trùng với slug sản phẩm mẫu).
// Mô hình không có trong bảng vẫn xem và xoay được, chỉ không có nút đổi dạng và chọn dáng.

import { vehicleKind, type VehicleKind } from "./vehicle-motion";

export type ModelPose = {
  label: string;
  // Tên clip hoạt ảnh trong file .glb và vị trí trong clip (0 = đầu, 1 = cuối).
  clip: string;
  at: number;
  // Phát clip lặp lại (cử động thật của file), bắt đầu từ `at`. Không có thì đứng yên ở `at`.
  play?: boolean;
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
  // Loại dạng xe (src/lib/vehicle-motion.ts), quyết định các nút ở dạng xe. Không khai báo thì suy từ `transform.from`.
  vehicle?: VehicleKind;
  // Bộ hợp thể: slug các sản phẩm thành viên, và ngược lại slug của dạng hợp thể.
  members?: string[];
  combinesInto?: string;
};

// Các mô hình Transformers Alliance dùng chung bộ tên clip. Bốn dáng kinh điển; file nào thiếu clip thì
// dáng đó tự bị bỏ (ví dụ Megatron, Starscream không có clip thủ thế).
// Dáng đứng của mẫu Alliance: clip đứng yên (`idle01`, `idle02`) thì phát lặp (thở, đung đưa); khung đầu của clip vui
// mừng (dùng khi clip đứng yên bị quay ngang) thì đứng yên, vì phát tiếp sẽ thành dáng vui mừng.
function standPose(clip: string): ModelPose {
  return { label: "Đứng", clip, at: 0, ...(/^idle/.test(clip) ? { play: true } : {}) };
}

function alliance(extra: Partial<Record<"idle" | "win" | "transform" | "from", string>> = {}): ModelFeatures {
  return {
    transform: { kind: "transform", clip: extra.transform ?? "transform_r", from: extra.from ?? "Dạng xe", to: "Dạng robot" },
    poses: [
      standPose(extra.idle ?? "idle01"),
      { label: "Thủ thế", clip: "guard", at: 0.5, play: true },
      { label: "Tấn công", clip: "attack01", at: 0.45, play: true },
      { label: "Chiến thắng", clip: extra.win ?? "emo_joyful", at: 0.5, play: true },
    ],
  };
}

// Các dáng có sẵn của bộ clip Transformers Alliance. Mỗi dáng phát lặp clip của chính file; `at` là khung hình dùng để
// căn vị trí và là điểm bắt đầu phát.
const ALLIANCE_POSES = {
  guard: { label: "Thủ thế", clip: "guard", at: 0.5, play: true },
  attack: { label: "Tấn công", clip: "attack01", at: 0.45, play: true },
  joyful: { label: "Chiến thắng", clip: "emo_joyful", at: 0.5, play: true },
  rage: { label: "Giận dữ", clip: "emo_rage", at: 0.55, play: true },
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
  vehicle?: VehicleKind;
  // Bộ hợp thể: slug các thành viên (ở dạng ghép), hoặc slug của dạng ghép (ở thành viên).
  members?: string[];
  combinesInto?: string;
}): ModelFeatures {
  const poses: ModelPose[] = input.stand ? [standPose(input.stand)] : [];
  poses.push(...input.poses.map((key) => ALLIANCE_POSES[key]));
  return {
    ...(input.from ? { transform: { kind: "transform" as const, clip: input.transform ?? "transform_r", from: input.from, to: "Dạng robot" } } : {}),
    poses,
    ...(input.vehicle ? { vehicle: input.vehicle } : {}),
    ...(input.members ? { members: input.members } : {}),
    ...(input.combinesInto ? { combinesInto: input.combinesInto } : {}),
  };
}

// Thành viên Combaticons (Earth Wars G2). Nút đổi dạng dùng clip thường (biến hình tại chỗ); bản `_hero` cho xe bay
// vào từ xa nên dạng xe nằm ngoài khung nhìn. File không có clip đứng hay chiến đấu riêng: dáng "Đứng" là khung cuối
// clip biến hình, các dáng khác là khung hình giữa hai clip `_hero` mà robot đã ở dạng hoàn chỉnh, đứng trong khung
// nhìn (chụp và chọn bằng mắt ngày 19/11/2026).
function combaticon(clip: string, from: string, poses: ModelPose[]): ModelFeatures {
  return {
    transform: { kind: "transform", clip, from, to: "Dạng robot" },
    combinesInto: "bruticus",
    poses: [{ label: "Đứng", clip, at: 1 }, ...poses],
  };
}

export const MODEL_FEATURES: Record<string, ModelFeatures> = {
  bruticus: {
    transform: { kind: "combine", clip: "transform_to_main_hero", from: "5 thành viên", to: "Bruticus" },
    members: ["onslaught", "brawl", "swindle", "vortex", "blast-off"],
  },
  onslaught: combaticon("transform_to_main", "Xe tải pháo", [
    { label: "Dang tay", clip: "transform_to_alt_hero", at: 0.1 },
    { label: "Đấm", clip: "transform_to_alt_hero", at: 0.25 },
    { label: "Giương pháo", clip: "transform_to_main_hero", at: 0.8 },
  ]),
  brawl: combaticon("transform_to_robot", "Xe tăng", [
    { label: "Quỳ ngắm", clip: "transform_to_robot_hero", at: 0.6 },
    { label: "Giương pháo", clip: "transform_to_robot_hero", at: 0.8 },
    { label: "Đấm", clip: "transform_to_vehicle_hero", at: 0.25 },
  ]),
  swindle: combaticon("transform_to_robot", "Xe địa hình", [{ label: "Thủ thế", clip: "transform_to_vehicle_hero", at: 0.25 }]),
  vortex: combaticon("transform_to_main", "Trực thăng", [
    { label: "Thủ thế", clip: "transform_to_main_hero", at: 0.8 },
    { label: "Dang tay", clip: "transform_to_alt_hero", at: 0.1 },
  ]),
  "blast-off": combaticon("transform_to_main", "Tàu con thoi", [
    { label: "Hạ thấp", clip: "transform_to_main_hero", at: 0.6 },
    { label: "Vung tay", clip: "transform_to_main_hero", at: 0.8 },
    { label: "Lao tới", clip: "transform_to_alt_hero", at: 0.25 },
  ]),
  "alliance-optimus-prime": alliance({ idle: "idle02" }),
  "alliance-megatron": alliance({ win: "emo_joy" }),
  // Clip đứng yên và chiến thắng của Starscream quay ngang người; khung đầu của clip vui mừng thì nhìn thẳng.
  "alliance-starscream": alliance({ transform: "transform_r_Garage", idle: "emo_joyful", from: "Máy bay" }),
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
  "alliance-grimlock": allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful"], combinesInto: "volcanicus" }),
  blades: allianceModel({ from: "Trực thăng", stand: "idle01", poses: ["attack", "joyful", "rage"], combinesInto: "defensor" }),
  bonecrusher: allianceModel({ from: "Xe ủi", stand: "emo_joyful", poses: ["attack", "joyful", "rage"], combinesInto: "devastator" }),
  breakdown: allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["attack", "joyful", "rage"], combinesInto: "menasor" }),
  cliffjumper: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  "dead-end": allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["guard", "joyful", "rage"], combinesInto: "menasor" }),
  defensor: allianceModel({
    from: null,
    stand: "idle01",
    poses: ["attack", "joyful", "rage"],
    members: ["hot-spot", "groove", "blades", "first-aid", "streetwise"],
  }),
  // Dạng thay thế của Devastator là 6 xe công trình đứng rời, của Volcanicus là 5 khủng long rời (chụp 19/11/2026).
  devastator: allianceModel({
    from: "Dạng thay thế",
    transform: "transform_r_Garage",
    stand: "idle01",
    poses: ["joyful", "rage"],
    vehicle: "group",
    members: ["scrapper", "mixmaster", "bonecrusher", "hook", "long-haul", "scavenger"],
  }),
  "drag-strip": allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"], combinesInto: "menasor" }),
  "first-aid": allianceModel({ from: "Xe cứu thương", stand: "emo_joyful", poses: ["joyful"], combinesInto: "defensor" }),
  galvatron: allianceModel({ from: "Xe tăng pháo", stand: "idle01", poses: ["guard", "joyful", "rage"] }),
  groove: allianceModel({ from: "Mô tô", stand: null, poses: ["rage", "guard"], combinesInto: "defensor" }),
  hook: allianceModel({ from: "Xe cẩu", stand: "idle01", poses: ["attack", "joyful"], combinesInto: "devastator" }),
  "hot-spot": allianceModel({ from: "Xe cứu hoả", stand: "idle01", poses: ["guard", "joyful", "rage"], combinesInto: "defensor" }),
  hound: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["guard", "joyful", "rage"] }),
  ironhide: allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["attack", "joyful", "rage"] }),
  jazz: allianceModel({ from: "Dạng xe", stand: "idle02", poses: ["joyful"] }),
  jetfire: allianceModel({ from: "Máy bay", stand: "idle01", poses: ["attack", "rage"] }),
  "long-haul": allianceModel({ from: "Xe tải", stand: "emo_joyful", poses: ["guard", "joyful", "rage"], combinesInto: "devastator" }),
  menasor: allianceModel({
    from: null,
    stand: "idle01",
    poses: ["joyful", "rage"],
    members: ["motormaster", "drag-strip", "dead-end", "breakdown", "wildrider"],
  }),
  mixmaster: allianceModel({ from: "Xe trộn bê tông", stand: "emo_joyful", poses: ["attack", "joyful", "rage"], combinesInto: "devastator" }),
  motormaster: allianceModel({ from: "Xe đầu kéo", stand: "idle01", poses: ["guard", "joyful"], combinesInto: "menasor" }),
  "optimus-primal": allianceModel({ from: "Khỉ đột", stand: "idle01", poses: ["joyful", "rage"] }),
  "predacon-megatron": allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful", "rage"] }),
  "rodimus-prime": allianceModel({ from: "Dạng xe", stand: "idle01", poses: ["joyful", "rage"] }),
  scavenger: allianceModel({ from: "Xe xúc", stand: "emo_joyful", poses: ["attack", "joyful"], combinesInto: "devastator" }),
  scrapper: allianceModel({ from: "Xe xúc lật", stand: "emo_joyful", poses: ["joyful"], combinesInto: "devastator" }),
  shockwave: allianceModel({ from: "Tàu bay", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["joyful", "rage"], vehicle: "air" }),
  skywarp: allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  slag: allianceModel({ from: "Khủng long", stand: "idle01", poses: ["attack", "joyful"], combinesInto: "volcanicus" }),
  sludge: allianceModel({ from: "Khủng long", stand: "emo_joyful", poses: ["guard", "attack", "joyful", "rage"], combinesInto: "volcanicus" }),
  snarl: allianceModel({ from: "Khủng long", stand: "idle01", poses: ["joyful", "rage"], combinesInto: "volcanicus" }),
  "star-saber": allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "idle02", poses: ["joyful"] }),
  streetwise: allianceModel({ from: "Xe cảnh sát", stand: null, poses: ["guard", "rage"], combinesInto: "defensor" }),
  swoop: allianceModel({ from: "Thằn lằn bay", stand: "emo_joyful", poses: ["guard", "joyful", "rage"], combinesInto: "volcanicus" }),
  thundercracker: allianceModel({ from: "Máy bay", transform: "transform_r_Garage", stand: "emo_joyful", poses: ["attack", "joyful", "rage"] }),
  "ultra-magnus": allianceModel({ from: "Xe đầu kéo", stand: "idle02", poses: ["guard", "attack", "joyful", "rage"] }),
  volcanicus: allianceModel({
    from: "Dạng thay thế",
    stand: "idle01",
    poses: ["attack", "joyful", "rage"],
    vehicle: "group",
    members: ["alliance-grimlock", "slag", "sludge", "snarl", "swoop"],
  }),
  waspinator: allianceModel({ from: "Ong bắp cày", stand: "emo_joyful", poses: ["joyful"] }),
  wheeljack: allianceModel({ from: "Dạng xe", stand: "emo_joyful", poses: ["joyful", "rage"] }),
  wildrider: allianceModel({ from: "Dạng xe", stand: null, poses: ["guard", "attack", "joyful", "rage"], combinesInto: "menasor" }),

  // Grimlock dạng khủng long (file riêng, không có clip biến hình): 4 clip của chính file, kiểm bằng ảnh chụp khung xem.
  grimlock: {
    poses: [
      { label: "Đứng", clip: "idle_skeletal.001", at: 0 },
      { label: "Gầm", clip: "roar_skeletal.001", at: 0.35 },
      { label: "Cắn", clip: "bite_skeletal.001", at: 0.3 },
      { label: "Quật đuôi", clip: "attack_tail_skeletal.001", at: 0.45 },
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

// Dòng hướng dẫn dưới khung 3D. Mô hình có Chạy/Bay/Bắn ở dạng xe thì ghi rõ các chuyển động đó do cửa hàng tự dựng
// (file .glb chỉ có clip biến hình, clip nghỉ), để không nhầm là hoạt ảnh gốc của tác giả mô hình (giấy phép CC BY).
export function viewerHint(features: ModelFeatures | null | undefined): string {
  const transform = features?.transform;
  const kind = vehicleKindOf(features);
  return [
    "Kéo để xoay, giữ Ctrl và cuộn để phóng to.",
    transform &&
      (transform.kind === "combine" ? "Bấm Hợp thể để xem các thành viên ghép lại." : "Bấm nút đổi dạng để chuyển giữa dạng xe và dạng robot."),
    kind &&
      kind !== "beast" &&
      kind !== "group" &&
      "Chuyển động chạy, bay, bắn ở dạng xe do cửa hàng tự dựng, không phải hoạt ảnh gốc của tác giả mô hình.",
  ]
    .filter(Boolean)
    .join(" ");
}

// Loại dạng xe của mô hình: chỉ mô hình biến hình (không phải hợp thể) mới có dạng xe.
export function vehicleKindOf(features: ModelFeatures | null | undefined): VehicleKind | null {
  const transform = features?.transform;
  if (!transform || transform.kind !== "transform") return null;
  return features.vehicle ?? vehicleKind(transform.from);
}

export function getModelFeatures(modelUrl: string | null | undefined): ModelFeatures | null {
  const key = modelKey(modelUrl);
  return key ? (MODEL_FEATURES[key] ?? null) : null;
}
