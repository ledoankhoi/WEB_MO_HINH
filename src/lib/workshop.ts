// Xưởng ROBOTICA (trang sản phẩm): dịch vụ tuỳ biến làm theo đơn cho mô hình đã sản xuất. Tuỳ chọn phải thực tế: không
// đổi linh kiện của hàng nhà sản xuất, chỉ sơn lại, thêm đế, đèn LED, lắp ráp hộ, decal, hộp quà
// (docs/ke-hoach/mo-rong-cua-hang.md). Dùng chung cho trình duyệt (xem trước, tính tạm) và máy chủ (tính lại giá khi
// đặt hàng, không tin số liệu trình duyệt gửi lên).
//
// Cấu hình lưu trong dòng giỏ hàng dạng chuỗi `cfg`, ví dụ "paint:do-tham.finish:bong.stand:luc-giac.decal:MINH_01".
// Chuỗi rỗng là bản nguyên hộp.

export type WorkshopChoice = { key: string; label: string; price: number; note?: string };
export type WorkshopGroup = {
  key: "paint" | "finish" | "stand" | "led" | "assembly" | "decal" | "gift";
  label: string;
  description: string;
  choices: WorkshopChoice[];
  // Danh mục áp dụng (slug); không có là mọi danh mục trừ phụ kiện.
  categories?: readonly string[];
  // Chỉ hiện khi nhóm khác đang chọn khác "none".
  requires?: WorkshopGroup["key"];
  // Số ngày xử lý thêm khi chọn khác "none".
  leadDays: number;
};

export const WORKSHOP_GROUPS: WorkshopGroup[] = [
  {
    key: "paint",
    label: "Dịch vụ sơn lại",
    description: "Thợ sơn của xưởng tháo rời, sơn lót và phủ lại theo phối màu bạn chọn. Xem trước màu trên mô hình 3D.",
    leadDays: 7,
    choices: [
      { key: "none", label: "Nguyên bản", price: 0 },
      { key: "do-tham", label: "Đỏ thẫm", price: 350_000 },
      { key: "bang-lam", label: "Băng lam", price: 350_000 },
      { key: "bong-dem", label: "Bóng đêm", price: 350_000 },
      { key: "vang-solar", label: "Vàng Solar", price: 450_000, note: "Sơn nhũ vàng hai lớp" },
    ],
  },
  {
    key: "finish",
    label: "Lớp hoàn thiện",
    description: "Lớp phủ bảo vệ sau khi sơn.",
    requires: "paint",
    leadDays: 0,
    choices: [
      { key: "nham", label: "Nhám", price: 0 },
      { key: "bong", label: "Bóng", price: 80_000 },
      { key: "anh-kim", label: "Ánh kim", price: 150_000 },
    ],
  },
  {
    key: "stand",
    label: "Đế trưng bày",
    description: "Đế mica lục giác có khớp đỡ hông, khắc tên mẫu.",
    leadDays: 0,
    choices: [
      { key: "none", label: "Không lấy đế", price: 0 },
      { key: "luc-giac", label: "Đế lục giác", price: 90_000 },
      { key: "luc-giac-led", label: "Đế lục giác có đèn LED", price: 250_000, note: "Pin AAA kèm theo" },
    ],
  },
  {
    key: "led",
    label: "Đèn LED gắn mắt, ngực",
    description: "Xưởng khoan, đi dây và gắn đèn LED siêu nhỏ, công tắc giấu dưới chân.",
    categories: ["transformers", "robot-hop-the", "super-sentai", "mecha-anime", "model-kits"],
    leadDays: 3,
    choices: [
      { key: "none", label: "Không gắn", price: 0 },
      { key: "mat-nguc", label: "Gắn LED mắt và ngực", price: 180_000 },
    ],
  },
  {
    key: "assembly",
    label: "Lắp ráp hộ",
    description: "Thợ của xưởng lắp sẵn bộ kit, gọt ba via, dán decal theo hướng dẫn.",
    categories: ["model-kits"],
    leadDays: 4,
    choices: [
      { key: "none", label: "Tự lắp", price: 0 },
      { key: "lap-rap", label: "Lắp ráp hoàn chỉnh", price: 300_000 },
      { key: "lap-rap-ke-chi", label: "Lắp ráp + kẻ chỉ, phủ mờ", price: 550_000 },
    ],
  },
  {
    key: "decal",
    label: "Decal tên riêng",
    description: "In tên hoặc mã số của bạn lên decal nước, dán ở vai hoặc chân (tối đa 12 ký tự A–Z, 0–9).",
    leadDays: 2,
    choices: [
      { key: "none", label: "Không in", price: 0 },
      { key: "ten-rieng", label: "In decal tên riêng", price: 60_000 },
    ],
  },
  {
    key: "gift",
    label: "Hộp quà",
    description: "Hộp cứng màu đỏ ROBOTICA, giấy rơm và thiệp.",
    leadDays: 0,
    choices: [
      { key: "none", label: "Không gói quà", price: 0 },
      { key: "hop-qua", label: "Gói hộp quà", price: 40_000 },
    ],
  },
];

// Màu xem trước trên mô hình 3D cho từng phối màu sơn (nhân với màu gốc của chất liệu).
export const PAINT_TINTS: Record<string, string> = {
  "do-tham": "#d23a32",
  "bang-lam": "#7fb4ff",
  "bong-dem": "#4a4f5c",
  "vang-solar": "#f2c14e",
};

export const DECAL_PATTERN = /^[A-Z0-9 ]{1,12}$/;

export type WorkshopSelection = Partial<Record<WorkshopGroup["key"], string>> & { decalText?: string };

export function groupsFor(category: string): WorkshopGroup[] {
  if (category === "phu-kien") return [];
  return WORKSHOP_GROUPS.filter((group) => !group.categories || group.categories.includes(category));
}

export const hasWorkshop = (category: string) => groupsFor(category).length > 0;

// Chọn → chuỗi cfg (bỏ nhóm "none"; finish chỉ có khi có sơn).
export function serializeConfig(selection: WorkshopSelection): string {
  const parts: string[] = [];
  for (const group of WORKSHOP_GROUPS) {
    const choice = selection[group.key];
    if (!choice || choice === "none") continue;
    if (group.requires && (!selection[group.requires] || selection[group.requires] === "none")) continue;
    if (group.key === "finish" && choice === "nham") continue;
    parts.push(`${group.key}:${choice}`);
  }
  if (selection.decal === "ten-rieng" && selection.decalText) parts.push(`text:${selection.decalText.trim().replace(/ /g, "_")}`);
  return parts.join(".");
}

export type ParsedConfig = {
  price: number;
  leadDays: number;
  lines: { group: string; label: string; price: number }[];
  summary: string;
  tint: string | null;
  selection: WorkshopSelection;
};

// Kiểm tra và tính giá một chuỗi cfg cho danh mục. null nếu không hợp lệ (nhóm không áp dụng, lựa chọn không có, thiếu
// chữ in decal...). Chuỗi rỗng hợp lệ (bản nguyên hộp).
export function parseConfig(cfg: string, category: string): ParsedConfig | null {
  const empty: ParsedConfig = { price: 0, leadDays: 0, lines: [], summary: "", tint: null, selection: {} };
  if (cfg === "") return empty;
  if (cfg.length > 200 || !/^[a-z]+:[A-Za-z0-9_-]+(\.[a-z]+:[A-Za-z0-9_-]+)*$/.test(cfg)) return null;
  const groups = groupsFor(category);
  const selection: WorkshopSelection = {};
  for (const part of cfg.split(".")) {
    const [key, value] = part.split(":");
    if (key === "text") {
      const text = value.replace(/_/g, " ");
      if (!DECAL_PATTERN.test(text) || selection.decalText !== undefined) return null;
      selection.decalText = text;
      continue;
    }
    const group = groups.find((item) => item.key === key);
    if (!group || selection[group.key] !== undefined || value === "none" || !group.choices.some((choice) => choice.key === value)) return null;
    selection[group.key] = value;
  }
  if (selection.finish && !selection.paint) return null;
  if ((selection.decal === "ten-rieng") !== (selection.decalText !== undefined)) return null;

  const result: ParsedConfig = { ...empty, selection, tint: selection.paint ? (PAINT_TINTS[selection.paint] ?? null) : null };
  for (const group of groups) {
    const key = selection[group.key];
    if (!key) continue;
    const choice = group.choices.find((item) => item.key === key)!;
    result.price += choice.price;
    result.leadDays += group.leadDays;
    result.lines.push({ group: group.label, label: group.key === "decal" ? `${choice.label} "${selection.decalText}"` : choice.label, price: choice.price });
  }
  result.summary = result.lines.map((line) => `${line.group}: ${line.label}`).join("; ");
  return result;
}
