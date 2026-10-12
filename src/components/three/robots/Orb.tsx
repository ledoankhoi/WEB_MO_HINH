"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glass, Glow, Paint } from "../parts";
import type { RobotProps } from "./types";

const HALF_PI = Math.PI / 2;
const VENTS = [-0.12, 0, 0.12] as const;

export default function Orb({ colors, animate = true }: RobotProps) {
  const craft = useRef<Group>(null);
  const ringOuter = useRef<Group>(null);
  const ringInner = useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (craft.current) {
      craft.current.position.y = Math.sin(t * 1.4) * 0.05;
      craft.current.rotation.y = Math.sin(t * 0.5) * 0.3;
    }
    if (ringOuter.current) ringOuter.current.rotation.z += delta * 0.9;
    if (ringInner.current) ringInner.current.rotation.x -= delta * 1.3;
  });

  return (
    <group>
      {/* Đế nâng từ tính */}
      <mesh position={[0, -0.975, 0]}>
        <cylinderGeometry args={[0.34, 0.4, 0.05, 40]} />
        <Frame />
      </mesh>
      <mesh position={[0, -0.948, 0]} rotation={[HALF_PI, 0, 0]}>
        <torusGeometry args={[0.26, 0.02, 12, 48]} />
        <Glow color={colors.accent} intensity={1.6} />
      </mesh>

      <group ref={craft}>
        {/* Thân cầu */}
        <mesh>
          <sphereGeometry args={[0.52, 56, 40]} />
          <Paint color={colors.primary} metalness={0.3} roughness={0.32} />
        </mesh>
        <mesh rotation={[HALF_PI, 0, 0]}>
          <torusGeometry args={[0.522, 0.018, 12, 64]} />
          <Frame />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.5, 0.02, 0]} rotation={[0, side * HALF_PI, 0]}>
            {VENTS.map((y) => (
              <mesh key={y} position={[0, y, 0.02]}>
                <boxGeometry args={[0.2, 0.03, 0.03]} />
                <Frame />
              </mesh>
            ))}
          </group>
        ))}

        {/* Mắt cảm biến */}
        <mesh position={[0, 0, 0.44]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.27, 0.3, 0.12, 48]} />
          <Frame />
        </mesh>
        <mesh position={[0, 0, 0.5]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.23, 0.23, 0.03, 48]} />
          <Glass />
        </mesh>
        <mesh position={[0, 0, 0.518]}>
          <torusGeometry args={[0.14, 0.02, 12, 48]} />
          <Glow color={colors.accent} />
        </mesh>
        <mesh position={[0, 0, 0.51]} scale={[1, 1, 0.4]}>
          <sphereGeometry args={[0.06, 24, 18]} />
          <Glow color={colors.accent} intensity={3} />
        </mesh>

        {/* Ăng-ten và vòi đẩy */}
        <mesh position={[0, 0.58, -0.05]}>
          <cylinderGeometry args={[0.008, 0.012, 0.18, 8]} />
          <Chrome />
        </mesh>
        <mesh position={[0, 0.68, -0.05]}>
          <sphereGeometry args={[0.022, 12, 10]} />
          <Glow color={colors.accent} />
        </mesh>
        <mesh position={[0, -0.53, 0]}>
          <cylinderGeometry args={[0.16, 0.1, 0.08, 28]} />
          <Frame />
        </mesh>
        <mesh position={[0, -0.572, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.01, 28]} />
          <Glow color={colors.accent} intensity={1.8} />
        </mesh>

        {/* Hai vòng con quay xoay độc lập */}
        <group rotation={[HALF_PI - 0.35, 0, 0.2]}>
          <group ref={ringOuter}>
            <mesh>
              <torusGeometry args={[0.82, 0.022, 12, 96]} />
              <Paint color={colors.secondary} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[0.82, 0, 0]}>
              <sphereGeometry args={[0.045, 16, 12]} />
              <Glow color={colors.accent} />
            </mesh>
          </group>
        </group>
        <group rotation={[0, 0.5, 0.5]}>
          <group ref={ringInner}>
            <mesh>
              <torusGeometry args={[0.68, 0.018, 12, 96]} />
              <Paint color={colors.secondary} metalness={0.85} roughness={0.25} />
            </mesh>
            <mesh position={[0, 0.68, 0]}>
              <sphereGeometry args={[0.038, 16, 12]} />
              <Chrome />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
