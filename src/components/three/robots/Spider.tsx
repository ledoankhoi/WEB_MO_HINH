"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Frame, Glow, Paint, Rubber, Strut } from "../parts";
import type { RobotProps } from "./types";

const HALF_PI = Math.PI / 2;
const BODY_Y = -0.4;

// Góc của từng chân tính từ hướng mũi (+Z), bên phải dương, bên trái âm.
const LEG_ANGLES = [0.62, 1.57, 2.5, -0.62, -1.57, -2.5];

const EYES: [number, number, number][] = [
  [-0.09, 0.04, 0.16],
  [0.09, 0.04, 0.16],
  [-0.04, -0.03, 0.17],
  [0.04, -0.03, 0.17],
];

export default function Spider({ colors, animate = true }: RobotProps) {
  const body = useRef<Group>(null);
  const legs = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (body.current) body.current.position.y = Math.sin(t * 2.2) * 0.02;
    legs.current.forEach((leg, index) => {
      if (!leg) return;
      // Dáng đi ba chân: các chân xen kẽ nhau nhấc lên lệch nửa chu kỳ.
      const phase = index % 2 === 0 ? 0 : Math.PI;
      leg.rotation.z = Math.max(0, Math.sin(t * 2.2 + phase)) * 0.14;
    });
  });

  return (
    <group>
      <group ref={body}>
        {/* Thân trước, bụng và đầu */}
        <mesh position={[0, BODY_Y, 0.02]} scale={[0.36, 0.2, 0.44]}>
          <sphereGeometry args={[1, 36, 24]} />
          <Paint color={colors.primary} metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, BODY_Y + 0.08, -0.52]} scale={[0.34, 0.26, 0.4]}>
          <sphereGeometry args={[1, 36, 24]} />
          <Paint color={colors.primary} metalness={0.6} roughness={0.35} />
        </mesh>
        {[-0.38, -0.56, -0.74].map((z, index) => (
          <mesh key={z} position={[0, BODY_Y + 0.08, z]} scale={[1, 0.76, 1]}>
            <torusGeometry args={[[0.325, 0.345, 0.29][index], 0.016, 10, 40]} />
            <Paint color={colors.secondary} metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, BODY_Y + 0.21, 0.02]} scale={[0.2, 0.05, 0.28]}>
          <sphereGeometry args={[1, 24, 16]} />
          <Paint color={colors.secondary} metalness={0.6} roughness={0.35} />
        </mesh>
        <group position={[0, BODY_Y + 0.02, 0.4]}>
          <mesh scale={[0.2, 0.14, 0.18]}>
            <sphereGeometry args={[1, 28, 20]} />
            <Frame />
          </mesh>
          {EYES.map(([x, y, z], index) => (
            <mesh key={index} position={[x, y, z]}>
              <sphereGeometry args={[index < 2 ? 0.04 : 0.026, 16, 12]} />
              <Glow color={colors.accent} intensity={3} />
            </mesh>
          ))}
          {[-1, 1].map((side) => (
            <Strut key={side} from={[side * 0.07, -0.08, 0.12]} to={[side * 0.05, -0.2, 0.22]} radius={0.022} radiusEnd={0.006}>
              <Frame />
            </Strut>
          ))}
        </group>
      </group>

      {/* Sáu chân: mỗi chân dựng dọc theo trục +X cục bộ rồi xoay quanh thân */}
      {LEG_ANGLES.map((angle, index) => (
        <group
          key={angle}
          position={[Math.sin(angle) * 0.28, BODY_Y, Math.cos(angle) * 0.3 + 0.02]}
          rotation={[0, angle - HALF_PI, 0]}
        >
          <group
            ref={(element) => {
              legs.current[index] = element;
            }}
          >
            <mesh>
              <sphereGeometry args={[0.075, 20, 14]} />
              <Frame />
            </mesh>
            <Strut from={[0, 0, 0]} to={[0.4, 0.42, 0]} radius={0.045} radiusEnd={0.038}>
              <Paint color={colors.secondary} metalness={0.6} roughness={0.35} />
            </Strut>
            <mesh position={[0.4, 0.42, 0]}>
              <sphereGeometry args={[0.06, 18, 14]} />
              <Frame />
            </mesh>
            <Strut from={[0.4, 0.42, 0]} to={[0.72, -0.585, 0]} radius={0.04} radiusEnd={0.014}>
              <Paint color={colors.primary} metalness={0.6} roughness={0.35} />
            </Strut>
            <mesh position={[0.72, -0.585, 0]}>
              <sphereGeometry args={[0.02, 12, 10]} />
              <Rubber />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
