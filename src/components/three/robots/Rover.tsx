"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, type Group } from "three";
import { Chrome, Frame, Glass, Glow, Paint, Rubber, Strut } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const AXLES = [-0.58, 0, 0.58] as const;
const HALF_PI = Math.PI / 2;
const BOLTS = [0, 1, 2, 3, 4].map((i) => (i / 5) * Math.PI * 2);

export default function Rover({ colors, animate = true }: RobotProps) {
  const wheels = useRef<(Group | null)[]>([]);
  const mastHead = useRef<Group>(null);
  const armJoint = useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x += delta * 1.1;
    }
    if (mastHead.current) mastHead.current.rotation.y = Math.sin(t * 0.6) * 0.7;
    if (armJoint.current) armJoint.current.rotation.x = -0.5 + Math.sin(t * 0.9) * 0.18;
  });

  return (
    <group>
      {/* Sáu bánh và hệ treo */}
      {SIDES.map((side, sideIndex) => (
        <group key={side}>
          {AXLES.map((z, axleIndex) => (
            <group key={z}>
              <group
                ref={(element) => {
                  wheels.current[sideIndex * 3 + axleIndex] = element;
                }}
                position={[side * 0.54, -0.78, z]}
              >
                <mesh rotation={[0, 0, HALF_PI]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.17, 32]} />
                  <Rubber />
                </mesh>
                <mesh rotation={[0, 0, HALF_PI]}>
                  <cylinderGeometry args={[0.13, 0.13, 0.18, 24]} />
                  <Paint color={colors.primary} />
                </mesh>
                {BOLTS.map((angle) => (
                  <mesh key={angle} position={[side * 0.092, Math.cos(angle) * 0.08, Math.sin(angle) * 0.08]}>
                    <sphereGeometry args={[0.016, 8, 6]} />
                    <Chrome />
                  </mesh>
                ))}
              </group>
              <Strut from={[side * 0.42, -0.78, z]} to={[side * 0.34, -0.5, z * 0.72]} radius={0.03}>
                <Frame color={colors.secondary} />
              </Strut>
            </group>
          ))}
          <Strut from={[side * 0.42, -0.66, -0.52]} to={[side * 0.42, -0.66, 0.52]} radius={0.025}>
            <Frame color={colors.secondary} />
          </Strut>
        </group>
      ))}

      {/* Thân xe và tấm pin mặt trời */}
      <RoundedBox args={[0.7, 0.24, 1.3]} radius={0.07} smoothness={3} position={[0, -0.42, 0]}>
        <Paint color={colors.primary} />
      </RoundedBox>
      <mesh position={[0, -0.285, -0.12]}>
        <boxGeometry args={[0.84, 0.03, 0.9]} />
        <Frame color={colors.secondary} />
      </mesh>
      <mesh position={[0, -0.268, -0.12]}>
        <boxGeometry args={[0.78, 0.012, 0.84]} />
        <Glass color="#0d2a52" />
      </mesh>
      {[-0.26, 0, 0.26].map((x) => (
        <mesh key={x} position={[x, -0.26, -0.12]}>
          <boxGeometry args={[0.008, 0.006, 0.84]} />
          <Chrome />
        </mesh>
      ))}
      {SIDES.map((side) => (
        <mesh key={side} position={[side * 0.22, -0.42, 0.652]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.02, 20]} />
          <Glow color="#fff7e0" intensity={1.8} />
        </mesh>
      ))}

      {/* Cần camera */}
      <Strut from={[0.2, -0.3, 0.46]} to={[0.2, 0.46, 0.46]} radius={0.028}>
        <Chrome />
      </Strut>
      <group ref={mastHead} position={[0.2, 0.54, 0.46]}>
        <RoundedBox args={[0.36, 0.17, 0.18]} radius={0.05} smoothness={3}>
          <Paint color={colors.primary} />
        </RoundedBox>
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.09, 0, 0.09]}>
            <mesh rotation={[HALF_PI, 0, 0]}>
              <cylinderGeometry args={[0.052, 0.052, 0.04, 24]} />
              <Glass />
            </mesh>
            <mesh position={[0, 0, 0.021]}>
              <torusGeometry args={[0.052, 0.008, 8, 28]} />
              <Glow color={colors.accent} intensity={1.6} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Ăng-ten chảo phía sau */}
      <Strut from={[-0.2, -0.28, -0.5]} to={[-0.2, 0.08, -0.5]} radius={0.016}>
        <Chrome />
      </Strut>
      <mesh position={[-0.2, 0.14, -0.5]} rotation={[0.9, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.03, 0.1, 32, 1, true]} />
        <meshStandardMaterial color={colors.primary} metalness={0.5} roughness={0.4} side={DoubleSide} />
      </mesh>
      <mesh position={[-0.2, 0.2, -0.45]}>
        <sphereGeometry args={[0.022, 12, 10]} />
        <Glow color={colors.accent} />
      </mesh>

      {/* Tay lấy mẫu phía trước */}
      <group position={[-0.18, -0.3, 0.6]}>
        <mesh rotation={[0, 0, HALF_PI]}>
          <cylinderGeometry args={[0.06, 0.06, 0.1, 20]} />
          <Frame />
        </mesh>
        <group ref={armJoint} rotation={[-0.5, 0, 0]}>
          <Strut from={[0, 0, 0]} to={[0, 0.34, 0]} radius={0.03}>
            <Frame color={colors.secondary} />
          </Strut>
          <group position={[0, 0.34, 0]} rotation={[1.7, 0, 0]}>
            <mesh rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.045, 0.045, 0.09, 18]} />
              <Frame />
            </mesh>
            <Strut from={[0, 0, 0]} to={[0, 0.3, 0]} radius={0.026}>
              <Paint color={colors.primary} />
            </Strut>
            {SIDES.map((side) => (
              <mesh key={side} position={[side * 0.035, 0.36, 0]} rotation={[0, 0, -side * 0.25]}>
                <boxGeometry args={[0.018, 0.12, 0.04]} />
                <Chrome />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}
