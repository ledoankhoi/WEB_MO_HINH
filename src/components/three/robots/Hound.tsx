"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Beam, Chrome, Frame, Glass, Glow, Paint, Rubber, Strut } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const HIPS = [0.36, -0.36] as const;
const HALF_PI = Math.PI / 2;

export default function Hound({ colors, animate = true }: RobotProps) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const tail = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    if (body.current) body.current.position.y = Math.sin(t * 2) * 0.012;
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 0.7) * 0.35;
      head.current.rotation.z = Math.sin(t * 1.1) * 0.08;
    }
    if (tail.current) tail.current.rotation.y = Math.sin(t * 7) * 0.45;
  });

  return (
    <group>
      {/* Bốn chân gập ngược */}
      {SIDES.map((side) =>
        HIPS.map((z) => {
          const x = side * 0.28;
          return (
            <group key={`${side}-${z}`}>
              <mesh position={[side * 0.24, -0.26, z]} rotation={[0, 0, HALF_PI]}>
                <cylinderGeometry args={[0.1, 0.1, 0.14, 24]} />
                <Frame />
              </mesh>
              <Beam from={[x, -0.26, z]} to={[x, -0.6, z - 0.16]} width={0.1} depth={0.13}>
                <Paint color={colors.primary} />
              </Beam>
              <mesh position={[x, -0.6, z - 0.16]} rotation={[0, 0, HALF_PI]}>
                <cylinderGeometry args={[0.062, 0.062, 0.13, 20]} />
                <Frame />
              </mesh>
              <Strut from={[x, -0.6, z - 0.16]} to={[x, -0.94, z + 0.03]} radius={0.04} radiusEnd={0.03}>
                <Frame color={colors.secondary} />
              </Strut>
              <mesh position={[x, -0.95, z + 0.035]}>
                <sphereGeometry args={[0.05, 18, 14]} />
                <Rubber />
              </mesh>
            </group>
          );
        }),
      )}

      <group ref={body}>
        {/* Thân */}
        <RoundedBox args={[0.42, 0.3, 1.02]} radius={0.1} smoothness={4} position={[0, -0.2, 0]}>
          <Paint color={colors.primary} />
        </RoundedBox>
        <RoundedBox args={[0.3, 0.06, 0.8]} radius={0.025} smoothness={3} position={[0, -0.035, -0.02]}>
          <Frame color={colors.secondary} />
        </RoundedBox>
        {SIDES.map((side) => (
          <mesh key={side} position={[side * 0.212, -0.2, 0]}>
            <boxGeometry args={[0.012, 0.06, 0.5]} />
            <Glow color={colors.accent} intensity={1.4} />
          </mesh>
        ))}
        <mesh position={[0, -0.36, 0]}>
          <boxGeometry args={[0.3, 0.04, 0.7]} />
          <Frame />
        </mesh>

        {/* Cổ và đầu cảm biến */}
        <Strut from={[0, -0.12, 0.44]} to={[0, 0.02, 0.62]} radius={0.07}>
          <Frame />
        </Strut>
        <group ref={head} position={[0, 0.06, 0.68]}>
          <RoundedBox args={[0.3, 0.24, 0.36]} radius={0.08} smoothness={4}>
            <Paint color={colors.primary} />
          </RoundedBox>
          <RoundedBox args={[0.26, 0.1, 0.06]} radius={0.028} smoothness={3} position={[0, 0.02, 0.165]}>
            <Glass />
          </RoundedBox>
          <mesh position={[0, 0.02, 0.197]}>
            <boxGeometry args={[0.2, 0.026, 0.01]} />
            <Glow color={colors.accent} />
          </mesh>
          <RoundedBox args={[0.16, 0.08, 0.12]} radius={0.03} smoothness={3} position={[0, -0.09, 0.2]}>
            <Frame color={colors.secondary} />
          </RoundedBox>
          {SIDES.map((side) => (
            <mesh key={side} position={[side * 0.11, 0.17, -0.08]} rotation={[0.25, 0, side * 0.25]}>
              <boxGeometry args={[0.035, 0.14, 0.09]} />
              <Frame color={colors.secondary} />
            </mesh>
          ))}
        </group>

        {/* Đuôi ăng-ten */}
        <group ref={tail} position={[0, -0.12, -0.5]}>
          <Strut from={[0, 0, 0]} to={[0, 0.3, -0.22]} radius={0.016} radiusEnd={0.007}>
            <Chrome />
          </Strut>
          <mesh position={[0, 0.3, -0.22]}>
            <sphereGeometry args={[0.024, 12, 10]} />
            <Glow color={colors.accent} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
