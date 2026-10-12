"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glass, Glow, Paint, Strut, type Vec3 } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const HALF_PI = Math.PI / 2;

// Vị trí bốn mô-tơ: trái/phải và trước/sau.
const MOTORS: Vec3[] = [
  [-0.72, 0.05, 0.66],
  [0.72, 0.05, 0.66],
  [0.72, 0.05, -0.66],
  [-0.72, 0.05, -0.66],
];

export default function Drone({ colors, animate = true }: RobotProps) {
  const craft = useRef<Group>(null);
  const rotors = useRef<(Group | null)[]>([]);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (craft.current) {
      craft.current.position.y = 0.05 + Math.sin(t * 1.5) * 0.04;
      craft.current.rotation.z = Math.sin(t * 0.8) * 0.04;
      craft.current.rotation.x = Math.sin(t * 0.6) * 0.03;
    }
    rotors.current.forEach((rotor, index) => {
      // Hai cánh kề nhau quay ngược chiều như drone thật.
      if (rotor) rotor.rotation.y += delta * 38 * (index % 2 === 0 ? 1 : -1);
    });
  });

  return (
    <group scale={0.9}>
      <group ref={craft} position={[0, 0.05, 0]}>
        {/* Thân */}
        <RoundedBox args={[0.6, 0.2, 0.9]} radius={0.09} smoothness={4}>
          <Paint color={colors.primary} metalness={0.5} roughness={0.38} />
        </RoundedBox>
        <mesh position={[0, 0.1, 0.02]} scale={[0.24, 0.1, 0.34]}>
          <sphereGeometry args={[1, 32, 20]} />
          <Glass />
        </mesh>
        <mesh position={[0, 0.02, -0.455]}>
          <boxGeometry args={[0.36, 0.08, 0.02]} />
          <Frame />
        </mesh>
        {SIDES.map((side) => (
          <mesh key={side} position={[side * 0.19, 0.01, 0.452]}>
            <boxGeometry args={[0.12, 0.03, 0.012]} />
            <Glow color={colors.accent} />
          </mesh>
        ))}
        {SIDES.map((side) => (
          <mesh key={side} position={[side * 0.2, 0.01, -0.468]}>
            <boxGeometry args={[0.08, 0.03, 0.012]} />
            <Glow color="#ef4444" intensity={1.8} />
          </mesh>
        ))}

        {/* Tay đòn, mô-tơ và cánh quạt */}
        {MOTORS.map(([x, y, z], index) => (
          <group key={index}>
            <Strut from={[Math.sign(x) * 0.24, 0, Math.sign(z) * 0.32]} to={[x, y - 0.05, z]} radius={0.04} radiusEnd={0.03}>
              <Frame color={colors.secondary} />
            </Strut>
            <mesh position={[x, y, z]}>
              <cylinderGeometry args={[0.075, 0.085, 0.14, 24]} />
              <Frame />
            </mesh>
            <mesh position={[x, y + 0.09, z]}>
              <cylinderGeometry args={[0.03, 0.03, 0.05, 16]} />
              <Chrome />
            </mesh>
            <group
              ref={(element) => {
                rotors.current[index] = element;
              }}
              position={[x, y + 0.11, z]}
              rotation={[0, index * 0.7, 0]}
            >
              <mesh>
                <boxGeometry args={[0.58, 0.008, 0.06]} />
                <Frame color="#111418" />
              </mesh>
              <mesh rotation={[0, HALF_PI, 0]}>
                <boxGeometry args={[0.58, 0.008, 0.06]} />
                <Frame color="#111418" />
              </mesh>
            </group>
            <mesh position={[x, y + 0.11, z]} rotation={[HALF_PI, 0, 0]}>
              <torusGeometry args={[0.32, 0.013, 10, 48]} />
              <Paint color={colors.secondary} metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[x, y - 0.08, z]}>
              <sphereGeometry args={[0.022, 12, 10]} />
              <Glow color={z > 0 ? colors.accent : "#ef4444"} />
            </mesh>
          </group>
        ))}

        {/* Gimbal camera dưới mũi */}
        <mesh position={[0, -0.13, 0.3]}>
          <boxGeometry args={[0.1, 0.08, 0.1]} />
          <Frame />
        </mesh>
        <mesh position={[0, -0.23, 0.32]}>
          <sphereGeometry args={[0.1, 28, 20]} />
          <Frame color="#16191f" />
        </mesh>
        <mesh position={[0, -0.24, 0.41]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.04, 24]} />
          <Glass />
        </mesh>
        <mesh position={[0, -0.24, 0.432]}>
          <torusGeometry args={[0.05, 0.008, 8, 28]} />
          <Glow color={colors.accent} intensity={1.6} />
        </mesh>

        {/* Càng đáp */}
        {SIDES.map((side) => (
          <group key={side}>
            <Strut from={[side * 0.22, -0.08, 0.24]} to={[side * 0.3, -0.36, 0.3]} radius={0.016}>
              <Frame />
            </Strut>
            <Strut from={[side * 0.22, -0.08, -0.24]} to={[side * 0.3, -0.36, -0.3]} radius={0.016}>
              <Frame />
            </Strut>
            <Strut from={[side * 0.3, -0.36, -0.42]} to={[side * 0.3, -0.36, 0.42]} radius={0.02}>
              <Frame color={colors.secondary} />
            </Strut>
          </group>
        ))}
      </group>
    </group>
  );
}
