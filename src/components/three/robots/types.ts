import type { RobotColors } from "@/lib/catalog";

// Quy ước chung cho mọi mô hình: mặt đất ở y = -1, mô hình cao tối đa khoảng 2 đơn vị, rộng trong
// khoảng ±1.1 và quay mặt về phía +Z.
export type RobotProps = {
  colors: RobotColors;
  // Tắt chuyển động để chụp ảnh đại diện ở tư thế cố định.
  animate?: boolean;
};
