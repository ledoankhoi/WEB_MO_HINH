"use client";

import type { ComponentType } from "react";
import type { RobotModelKey } from "@/lib/catalog";
import Arm from "./Arm";
import Companion from "./Companion";
import Drone from "./Drone";
import Hound from "./Hound";
import Humanoid from "./Humanoid";
import Mech from "./Mech";
import Orb from "./Orb";
import Retro from "./Retro";
import Rover from "./Rover";
import Spider from "./Spider";
import type { RobotProps } from "./types";

// Thêm kiểu dáng mới: viết component trong thư mục này, khai báo khoá trong ROBOT_MODELS
// (src/lib/catalog.ts) rồi đăng ký ở đây.
const ROBOTS: Record<RobotModelKey, ComponentType<RobotProps>> = {
  humanoid: Humanoid,
  mech: Mech,
  companion: Companion,
  drone: Drone,
  rover: Rover,
  spider: Spider,
  hound: Hound,
  arm: Arm,
  orb: Orb,
  retro: Retro,
};

// Các mẫu thấp hoặc nhỏ được phóng lên một chút để lấp đầy khung nhìn tương đương các mẫu cao.
const DISPLAY_SCALE: Partial<Record<RobotModelKey, number>> = {
  hound: 1.22,
  rover: 1.08,
  arm: 1.06,
};

export function Robot({ model, ...props }: RobotProps & { model: RobotModelKey }) {
  const Component = ROBOTS[model] ?? Humanoid;
  const scale = DISPLAY_SCALE[model] ?? 1;
  // Phóng quanh điểm chạm đất (y = -1) để mô hình vẫn đứng trên mặt sàn.
  return (
    <group position={[0, scale - 1, 0]} scale={scale}>
      <Component {...props} />
    </group>
  );
}
