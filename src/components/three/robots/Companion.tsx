"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glass, Glow, Paint } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const HALF_PI = Math.PI / 2;

export default function Companion({ colors, animate = true }: RobotProps) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const wavingArm = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (body.current) body.current.position.y = Math.sin(t * 1.8) * 0.03;
    if (head.current) {
      head.current.rotation.z = Math.sin(t * 0.9) * 0.07;
      head.current.rotation.y = Math.sin(t * 0.5) * 0.22;
    }
    // Chớp mắt nhanh mỗi vài giây.
    if (eyes.current) eyes.current.scale.y = t % 3.6 < 0.12 ? 0.1 : 1;
    if (wavingArm.current) wavingArm.current.rotation.z = 0.9 + Math.sin(t * 4) * 0.3;
  });

  return (
    <group>
      {/* Đế từ tính với vòng sáng */}
      <mesh position={[0, -0.975, 0]}>
        <cylinderGeometry args={[0.36, 0.4, 0.05, 40]} />
        <Frame />
      </mesh>
      <mesh position={[0, -0.948, 0]} rotation={[HALF_PI, 0, 0]}>
        <torusGeometry args={[0.31, 0.022, 12, 48]} />
        <Glow color={colors.accent} intensity={1.6} />
      </mesh>

      <group ref={body}>
        {/* Thân */}
        <mesh position={[0, -0.42, 0]} scale={[0.46, 0.5, 0.44]}>
          <sphereGeometry args={[1, 40, 28]} />
          <Paint color={colors.primary} metalness={0.15} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.42, 0]} rotation={[HALF_PI, 0, 0]} scale={[1, 0.957, 1]}>
          <torusGeometry args={[0.455, 0.022, 12, 56]} />
          <Paint color={colors.secondary} metalness={0.2} roughness={0.45} />
        </mesh>
        <mesh position={[0, -0.25, 0.432]} rotation={[HALF_PI - 0.35, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.02, 24]} />
          <Glow color={colors.accent} />
        </mesh>
        <mesh position={[0, -0.88, 0]}>
          <cylinderGeometry args={[0.2, 0.12, 0.08, 28]} />
          <Frame />
        </mesh>
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.11, 0.13, 0.1, 24]} />
          <Frame />
        </mesh>

        {/* Đầu với màn hình mặt */}
        <group ref={head} position={[0, 0.45, 0]}>
          <RoundedBox args={[1, 0.72, 0.8]} radius={0.2} smoothness={5}>
            <Paint color={colors.primary} metalness={0.15} roughness={0.5} />
          </RoundedBox>
          <RoundedBox args={[0.66, 0.4, 0.06]} radius={0.028} smoothness={3} position={[0, 0, 0.385]}>
            <Glass />
          </RoundedBox>
          <group ref={eyes} position={[0, 0.03, 0.418]}>
            {SIDES.map((side) => (
              <mesh key={side} position={[side * 0.16, 0, 0]} scale={[0.07, 0.1, 0.02]}>
                <sphereGeometry args={[1, 24, 18]} />
                <Glow color={colors.accent} />
              </mesh>
            ))}
          </group>
          <mesh position={[0, -0.09, 0.418]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.06, 0.011, 8, 24, Math.PI]} />
            <Glow color={colors.accent} intensity={1.6} />
          </mesh>
          {SIDES.map((side) => (
            <group key={side} position={[side * 0.53, 0, 0]}>
              <mesh rotation={[0, 0, HALF_PI]}>
                <cylinderGeometry args={[0.13, 0.13, 0.08, 28]} />
                <Paint color={colors.secondary} metalness={0.2} roughness={0.45} />
              </mesh>
              <mesh position={[side * 0.042, 0, 0]} rotation={[0, HALF_PI, 0]}>
                <torusGeometry args={[0.085, 0.012, 10, 32]} />
                <Glow color={colors.accent} intensity={1.6} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.2, 10]} />
            <Chrome />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <sphereGeometry args={[0.045, 18, 14]} />
            <Glow color={colors.accent} />
          </mesh>
        </group>

        {/* Tay: tay trái vẫy chào */}
        {SIDES.map((side) => (
          <group
            key={side}
            ref={side === 1 ? wavingArm : undefined}
            position={[side * 0.43, -0.3, 0]}
            rotation={[0, 0, side === 1 ? 0.9 : -0.45]}
          >
            <mesh position={[0, -0.15, 0]}>
              <capsuleGeometry args={[0.06, 0.16, 8, 16]} />
              <Paint color={colors.secondary} metalness={0.2} roughness={0.45} />
            </mesh>
            <mesh position={[0, -0.31, 0]}>
              <sphereGeometry args={[0.075, 20, 14]} />
              <Paint color={colors.primary} metalness={0.15} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
