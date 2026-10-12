"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glass, Glow, Paint } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;

export default function Humanoid({ colors, animate = true }: RobotProps) {
  const upper = useRef<Group>(null);
  const head = useRef<Group>(null);
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (upper.current) upper.current.position.y = Math.sin(t * 1.6) * 0.012;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.6) * 0.28;
    if (armLeft.current) armLeft.current.rotation.x = Math.sin(t * 1.1) * 0.1;
    if (armRight.current) armRight.current.rotation.x = -Math.sin(t * 1.1) * 0.1;
  });

  return (
    <group>
      {/* Chân */}
      {SIDES.map((side) => (
        <group key={side} position={[side * 0.19, 0, 0]}>
          <mesh position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.1, 24, 16]} />
            <Frame />
          </mesh>
          <RoundedBox args={[0.17, 0.34, 0.2]} radius={0.05} smoothness={3} position={[0, -0.3, 0]}>
            <Frame color={colors.secondary} />
          </RoundedBox>
          <mesh position={[0, -0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.085, 0.085, 0.2, 24]} />
            <Frame />
          </mesh>
          <RoundedBox args={[0.15, 0.13, 0.06]} radius={0.025} smoothness={3} position={[0, -0.5, 0.1]}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <RoundedBox args={[0.2, 0.36, 0.24]} radius={0.06} smoothness={3} position={[0, -0.71, 0]}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <mesh position={[0, -0.72, 0.122]}>
            <boxGeometry args={[0.05, 0.22, 0.01]} />
            <Glow color={colors.accent} intensity={1.2} />
          </mesh>
          <mesh position={[0, -0.9, 0]}>
            <sphereGeometry args={[0.07, 20, 14]} />
            <Frame />
          </mesh>
          <RoundedBox args={[0.22, 0.1, 0.38]} radius={0.04} smoothness={3} position={[0, -0.945, 0.06]}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <mesh position={[0, -0.991, 0.06]}>
            <boxGeometry args={[0.2, 0.018, 0.36]} />
            <Frame />
          </mesh>
        </group>
      ))}

      <group ref={upper}>
        {/* Hông và eo */}
        <RoundedBox args={[0.5, 0.2, 0.3]} radius={0.07} smoothness={3} position={[0, -0.03, 0]}>
          <Frame color={colors.secondary} />
        </RoundedBox>
        <RoundedBox args={[0.18, 0.16, 0.08]} radius={0.03} smoothness={3} position={[0, -0.04, 0.14]}>
          <Paint color={colors.primary} />
        </RoundedBox>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.17, 0.15, 0.16, 28]} />
          <Frame />
        </mesh>
        {[0.09, 0.15].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.168, 0.012, 10, 36]} />
            <Chrome />
          </mesh>
        ))}

        {/* Ngực */}
        <RoundedBox args={[0.76, 0.48, 0.42]} radius={0.12} smoothness={4} position={[0, 0.43, 0]}>
          <Paint color={colors.primary} />
        </RoundedBox>
        <mesh position={[0, 0.47, 0.212]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.085, 0.085, 0.03, 32]} />
          <Glow color={colors.accent} />
        </mesh>
        <mesh position={[0, 0.47, 0.222]}>
          <torusGeometry args={[0.105, 0.02, 12, 40]} />
          <Chrome />
        </mesh>
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.23, 0.33, 0.212]}>
            {[0, 0.045].map((y) => (
              <mesh key={y} position={[0, y, 0]}>
                <boxGeometry args={[0.15, 0.02, 0.012]} />
                <Frame />
              </mesh>
            ))}
          </group>
        ))}
        <RoundedBox args={[0.46, 0.08, 0.32]} radius={0.035} smoothness={3} position={[0, 0.69, 0]}>
          <Frame color={colors.secondary} />
        </RoundedBox>

        {/* Ba lô đẩy */}
        <RoundedBox args={[0.44, 0.4, 0.16]} radius={0.06} smoothness={3} position={[0, 0.44, -0.27]}>
          <Frame color={colors.secondary} />
        </RoundedBox>
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.12, 0.2, -0.29]}>
            <mesh>
              <cylinderGeometry args={[0.05, 0.07, 0.12, 20]} />
              <Frame />
            </mesh>
            <mesh position={[0, -0.062, 0]}>
              <cylinderGeometry args={[0.05, 0.05, 0.01, 20]} />
              <Glow color={colors.accent} intensity={1.6} />
            </mesh>
          </group>
        ))}

        {/* Đầu */}
        <mesh position={[0, 0.74, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.1, 20]} />
          <Frame />
        </mesh>
        <group ref={head} position={[0, 0.92, 0]}>
          <RoundedBox args={[0.4, 0.34, 0.38]} radius={0.11} smoothness={4}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <RoundedBox args={[0.36, 0.11, 0.08]} radius={0.035} smoothness={3} position={[0, 0.02, 0.165]}>
            <Glass />
          </RoundedBox>
          {SIDES.map((side) => (
            <mesh key={side} position={[side * 0.085, 0.02, 0.207]}>
              <boxGeometry args={[0.09, 0.03, 0.01]} />
              <Glow color={colors.accent} />
            </mesh>
          ))}
          <mesh position={[0, 0.185, -0.02]}>
            <boxGeometry args={[0.05, 0.06, 0.28]} />
            <Frame color={colors.secondary} />
          </mesh>
          {SIDES.map((side) => (
            <mesh key={side} position={[side * 0.21, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.065, 0.065, 0.05, 24]} />
              <Frame />
            </mesh>
          ))}
          <mesh position={[0.235, 0.15, -0.02]}>
            <cylinderGeometry args={[0.007, 0.007, 0.24, 8]} />
            <Chrome />
          </mesh>
          <mesh position={[0.235, 0.28, -0.02]}>
            <sphereGeometry args={[0.02, 12, 10]} />
            <Glow color={colors.accent} />
          </mesh>
        </group>

        {/* Tay */}
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.5, 0.57, 0]} rotation={[0, 0, side * 0.09]}>
            <group ref={side === -1 ? armRight : armLeft}>
              <mesh>
                <sphereGeometry args={[0.12, 24, 16]} />
                <Frame />
              </mesh>
              <RoundedBox args={[0.26, 0.2, 0.3]} radius={0.08} smoothness={3} position={[side * 0.04, 0.04, 0]}>
                <Paint color={colors.primary} />
              </RoundedBox>
              <mesh position={[side * 0.172, 0.04, 0]}>
                <boxGeometry args={[0.01, 0.08, 0.2]} />
                <Glow color={colors.accent} intensity={1.2} />
              </mesh>
              <mesh position={[0, -0.22, 0]}>
                <cylinderGeometry args={[0.075, 0.07, 0.28, 20]} />
                <Frame color={colors.secondary} />
              </mesh>
              <mesh position={[0, -0.39, 0]}>
                <sphereGeometry args={[0.085, 20, 14]} />
                <Frame />
              </mesh>
              <RoundedBox args={[0.17, 0.32, 0.19]} radius={0.055} smoothness={3} position={[0, -0.58, 0]}>
                <Paint color={colors.primary} />
              </RoundedBox>
              <RoundedBox args={[0.11, 0.13, 0.14]} radius={0.04} smoothness={3} position={[0, -0.81, 0]}>
                <Frame />
              </RoundedBox>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
