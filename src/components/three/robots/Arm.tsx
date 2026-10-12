"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glow, Paint } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const HALF_PI = Math.PI / 2;

// Góc nghỉ của các trục (radian). Góc dương quay phần trên về phía trước (+Z).
const SHOULDER = -0.25;
const ELBOW = 1.35;
const WRIST = 0.9;

export default function Arm({ colors, animate = true }: RobotProps) {
  const turret = useRef<Group>(null);
  const shoulder = useRef<Group>(null);
  const elbow = useRef<Group>(null);
  const wrist = useRef<Group>(null);
  const fingers = useRef<(Group | null)[]>([]);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (turret.current) turret.current.rotation.y = Math.sin(t * 0.45) * 0.6;
    if (shoulder.current) shoulder.current.rotation.x = SHOULDER + Math.sin(t * 0.7) * 0.12;
    if (elbow.current) elbow.current.rotation.x = ELBOW + Math.sin(t * 0.9 + 1) * 0.2;
    if (wrist.current) wrist.current.rotation.x = WRIST + Math.sin(t * 1.3) * 0.25;
    const grip = (Math.sin(t * 1.6) + 1) / 2;
    fingers.current.forEach((finger, index) => {
      if (finger) finger.position.x = (index === 0 ? -1 : 1) * (0.035 + grip * 0.04);
    });
  });

  return (
    <group>
      {/* Đế */}
      <mesh position={[0, -0.96, 0]}>
        <cylinderGeometry args={[0.5, 0.54, 0.08, 48]} />
        <Frame color={colors.secondary} />
      </mesh>
      <mesh position={[0, -0.918, 0]} rotation={[HALF_PI, 0, 0]}>
        <torusGeometry args={[0.36, 0.014, 10, 56]} />
        <Glow color={colors.accent} intensity={1.6} />
      </mesh>
      <mesh position={[0, -0.8, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.24, 36]} />
        <Frame />
      </mesh>

      {/* Trục 1: mâm xoay */}
      <group ref={turret} position={[0, -0.62, 0]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.28, 0.12, 36]} />
          <Paint color={colors.primary} />
        </mesh>
        {SIDES.map((side) => (
          <RoundedBox key={side} args={[0.1, 0.36, 0.3]} radius={0.04} smoothness={3} position={[side * 0.2, 0.2, 0]}>
            <Paint color={colors.primary} />
          </RoundedBox>
        ))}

        {/* Trục 2: vai */}
        <group ref={shoulder} position={[0, 0.24, 0]} rotation={[SHOULDER, 0, 0]}>
          <mesh rotation={[0, 0, HALF_PI]}>
            <cylinderGeometry args={[0.15, 0.15, 0.52, 32]} />
            <Frame />
          </mesh>
          <RoundedBox args={[0.2, 0.74, 0.2]} radius={0.06} smoothness={3} position={[0, 0.4, 0]}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <mesh position={[0.102, 0.4, 0]}>
            <boxGeometry args={[0.008, 0.5, 0.08]} />
            <Frame />
          </mesh>

          {/* Trục 3: khuỷu */}
          <group ref={elbow} position={[0, 0.8, 0]} rotation={[ELBOW, 0, 0]}>
            <mesh rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.12, 0.12, 0.36, 28]} />
              <Frame />
            </mesh>
            <RoundedBox args={[0.16, 0.56, 0.16]} radius={0.05} smoothness={3} position={[0, 0.32, 0]}>
              <Paint color={colors.primary} />
            </RoundedBox>
            <mesh position={[0, 0.3, 0.085]}>
              <boxGeometry args={[0.05, 0.3, 0.01]} />
              <Glow color={colors.accent} intensity={1.2} />
            </mesh>

            {/* Trục 5: cổ tay và kẹp gắp */}
            <group ref={wrist} position={[0, 0.62, 0]} rotation={[WRIST, 0, 0]}>
              <mesh rotation={[0, 0, HALF_PI]}>
                <cylinderGeometry args={[0.085, 0.085, 0.24, 24]} />
                <Frame />
              </mesh>
              <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.06, 0.07, 0.1, 20]} />
                <Chrome />
              </mesh>
              <RoundedBox args={[0.2, 0.06, 0.1]} radius={0.025} smoothness={3} position={[0, 0.17, 0]}>
                <Frame color={colors.secondary} />
              </RoundedBox>
              {SIDES.map((side, index) => (
                <group
                  key={side}
                  ref={(element) => {
                    fingers.current[index] = element;
                  }}
                  position={[side * 0.06, 0.2, 0]}
                >
                  <mesh position={[0, 0.07, 0]}>
                    <boxGeometry args={[0.03, 0.16, 0.07]} />
                    <Chrome />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
