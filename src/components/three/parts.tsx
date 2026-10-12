"use client";

import { useMemo, type ReactNode } from "react";
import { Quaternion, Vector3 } from "three";

export type Vec3 = [number, number, number];

const UP = new Vector3(0, 1, 0);

// Lớp sơn chính của mô hình.
export function Paint({ color, metalness = 0.45, roughness = 0.42 }: { color: string; metalness?: number; roughness?: number }) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />;
}

// Khung, khớp và các chi tiết cơ khí tối màu.
export function Frame({ color = "#262b36" }: { color?: string }) {
  return <meshStandardMaterial color={color} metalness={0.7} roughness={0.45} />;
}

export function Chrome() {
  return <meshStandardMaterial color="#d7dde6" metalness={1} roughness={0.18} />;
}

export function Rubber() {
  return <meshStandardMaterial color="#14161b" metalness={0.05} roughness={0.92} />;
}

// Kính tối bóng dùng cho màn hình, kính che mắt, ống kính.
export function Glass({ color = "#070b14" }: { color?: string }) {
  return <meshPhysicalMaterial color={color} metalness={0.3} roughness={0.06} clearcoat={1} clearcoatRoughness={0.08} />;
}

// Chi tiết phát sáng (mắt, đèn, lõi năng lượng). Không qua tone mapping để giữ màu rực.
export function Glow({ color, intensity = 2.4 }: { color: string; intensity?: number }) {
  return <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />;
}

function useSpan(from: Vec3, to: Vec3) {
  const [ax, ay, az] = from;
  const [bx, by, bz] = to;
  return useMemo(() => {
    const a = new Vector3(ax, ay, az);
    const b = new Vector3(bx, by, bz);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const quaternion = new Quaternion().setFromUnitVectors(UP, direction.normalize());
    return { position: a.add(b).multiplyScalar(0.5), quaternion, length };
  }, [ax, ay, az, bx, by, bz]);
}

// Thanh trụ nối hai điểm. `radiusEnd` là bán kính ở đầu `to` (mặc định bằng `radius`).
export function Strut({
  from,
  to,
  radius = 0.05,
  radiusEnd,
  children,
}: {
  from: Vec3;
  to: Vec3;
  radius?: number;
  radiusEnd?: number;
  children: ReactNode;
}) {
  const { position, quaternion, length } = useSpan(from, to);
  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radiusEnd ?? radius, radius, length, 20]} />
      {children}
    </mesh>
  );
}

// Thanh hộp nối hai điểm, dùng cho chân và tay kiểu cơ khí.
export function Beam({
  from,
  to,
  width = 0.12,
  depth = 0.12,
  children,
}: {
  from: Vec3;
  to: Vec3;
  width?: number;
  depth?: number;
  children: ReactNode;
}) {
  const { position, quaternion, length } = useSpan(from, to);
  return (
    <mesh position={position} quaternion={quaternion}>
      <boxGeometry args={[width, length, depth]} />
      {children}
    </mesh>
  );
}
