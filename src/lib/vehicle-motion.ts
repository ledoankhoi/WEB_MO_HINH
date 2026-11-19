// Chuyển động ở dạng xe của khung 3D (src/components/three/Stage.tsx). File .glb không có clip xe chạy hay bắn, nên các
// chuyển động này do cửa hàng tự dựng bằng code: quay xương bánh xe, nhún thân, vạch đường, lửa đầu nòng tại xương súng.
// Xương được chọn theo tên có trong file. Dạng thú (khủng long, khỉ đột...) chỉ có clip nghỉ của chính file.

// group: dạng xe là nhóm nhiều xe hoặc thú tách rời (bộ hợp thể); như beast, chỉ có clip nghỉ.
export type VehicleKind = "ground" | "air" | "heli" | "beast" | "group";
export type VehicleAction = "idle" | "move" | "fire";

// Clip nghỉ ở dạng xe của các file Transformers Alliance (bản `_Garage` ở vài file).
export const VEHICLE_IDLE_CLIPS = ["vehicle_idle01", "vehicle_idle01_Garage"] as const;

const BEASTS = ["khủng long", "khỉ", "thằn lằn", "ong", "thú", "chim"];

// Loại xe theo tên dạng xe khai báo trong src/lib/model-features.ts (transform.from).
export function vehicleKind(from: string): VehicleKind {
  const name = from.toLowerCase();
  if (BEASTS.some((word) => name.includes(word))) return "beast";
  if (name.includes("trực thăng")) return "heli";
  if (name.includes("máy bay") || name.includes("tàu con thoi") || name.includes("phi cơ")) return "air";
  return "ground";
}

export function pickWheels(names: readonly string[]): string[] {
  return names.filter((name) => /wheel|tire|tyre/i.test(name) && !/shield|part/i.test(name));
}

// Tối đa hai nòng súng. Ưu tiên điểm đầu nòng (muzzle, barrel_end, điểm hiệu ứng) rồi mới tới xương súng.
export function pickGuns(names: readonly string[]): string[] {
  const guns = names.filter(
    (name) => /gun|cannon|barrel_end|muzzle|weapon|launcher/i.test(name) && !/melee|bullet|material|root|shield|pivot|tail/i.test(name),
  );
  const rank = (name: string) => (/muzzle|barrel_end|effect|point/i.test(name) ? 0 : 1);
  return [...guns].sort((a, b) => rank(a) - rank(b)).slice(0, 2);
}

export function pickRotors(names: readonly string[]): string[] {
  return names.filter((name) => /propel|rotor/i.test(name));
}

// Các nút ở dạng xe. `idle`: file có clip nghỉ ở dạng xe; `guns`: số nòng súng tìm được.
export function vehicleActions(kind: VehicleKind, { idle, guns }: { idle: boolean; guns: number }): { action: VehicleAction; label: string }[] {
  if (kind === "beast" || kind === "group") return idle ? [{ action: "idle", label: "Nghỉ" }] : [];
  const list: { action: VehicleAction; label: string }[] = [
    { action: "idle", label: "Nghỉ" },
    { action: "move", label: kind === "ground" ? "Chạy" : "Bay" },
  ];
  if (guns > 0) list.push({ action: "fire", label: "Bắn" });
  return list;
}
