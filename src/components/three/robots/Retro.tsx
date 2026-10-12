"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Chrome, Frame, Glow, Paint } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const HALF_PI = Math.PI / 2;
const BELLOWS = [0, 1, 2, 3, 4] as const;
const CREAM = "#f5ecd7";

export default function Retro({ colors, animate = true }: RobotProps) {
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const windupKey = useRef<Group>(null);
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);

  useFrame(({ clock }, delta) => {
    if (!animate) return;
    const t = clock.elapsedTime;
    // Láº¯c lÆ° nhÆ° Ä‘á»“ chÆ¡i dĂ¢y cĂ³t Ä‘ang bÆ°á»›c.
    if (body.current) body.current.rotation.z = Math.sin(t * 4) * 0.035;
    if (head.current) head.current.rotation.y = Math.sin(t * 0.8) * 0.3;
    if (windupKey.current) windupKey.current.rotation.z += delta * 2.5;
    if (armLeft.current) armLeft.current.rotation.x = Math.sin(t * 4) * 0.45;
    if (armRight.current) armRight.current.rotation.x = -Math.sin(t * 4) * 0.45;
  });

  return (
    <group ref={body}>
      {/* ChĂ¢n vĂ  bĂ n chĂ¢n */}
      {SIDES.map((side) => (
        <group key={side} position={[side * 0.2, 0, 0]}>
          <RoundedBox args={[0.25, 0.48, 0.27]} radius={0.03} smoothness={2} position={[0, -0.66, 0]}>
            <Paint color={colors.secondary} metalness={0.7} roughness={0.3} />
          </RoundedBox>
          <RoundedBox args={[0.3, 0.1, 0.42]} radius={0.03} smoothness={2} position={[0, -0.95, 0.05]}>
            <Paint color={colors.primary} metalness={0.7} roughness={0.3} />
          </RoundedBox>
        </group>
      ))}

      {/* ThĂ¢n há»™p vá»›i báº£ng Ä‘á»“ng há»“ */}
      <RoundedBox args={[0.82, 0.72, 0.5]} radius={0.04} smoothness={2} position={[0, -0.06, 0]}>
        <Paint color={colors.primary} metalness={0.7} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, -0.02, 0.252]}>
        <boxGeometry args={[0.6, 0.46, 0.02]} />
        <Paint color={colors.secondary} metalness={0.7} roughness={0.3} />
      </mesh>
      {SIDES.map((side) => (
        <group key={side} position={[side * 0.15, 0.08, 0.264]}>
          <mesh rotation={[HALF_PI, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.02, 32]} />
            <meshStandardMaterial color={CREAM} metalness={0.1} roughness={0.6} />
          </mesh>
          <mesh>
            <torusGeometry args={[0.1, 0.014, 10, 36]} />
            <Chrome />
          </mesh>
          <mesh position={[side * 0.025, 0.03, 0.012]} rotation={[0, 0, -side * 0.7]}>
            <boxGeometry args={[0.012, 0.085, 0.006]} />
            <Frame color="#b91c1c" />
          </mesh>
        </group>
      ))}
      {[-0.16, 0, 0.16].map((x, index) => (
        <mesh key={x} position={[x, -0.14, 0.266]} rotation={[HALF_PI, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.03, 20]} />
          <Glow color={index === 1 ? colors.accent : CREAM} intensity={index === 1 ? 2.4 : 0.5} />
        </mesh>
      ))}
      {[-0.26, -0.29, -0.32].map((y) => (
        <mesh key={y} position={[0, y, 0.262]}>
          <boxGeometry args={[0.34, 0.012, 0.008]} />
          <Frame />
        </mesh>
      ))}
      {SIDES.map((side) =>
        [-0.36, 0.24].map((y) => (
          <mesh key={`${side}-${y}`} position={[side * 0.35, y, 0.252]}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <Chrome />
          </mesh>
        )),
      )}

      {/* Cá»• vĂ  Ä‘áº§u */}
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.08, 24]} />
        <Chrome />
      </mesh>
      <group ref={head} position={[0, 0.58, 0]}>
        <RoundedBox args={[0.58, 0.42, 0.44]} radius={0.04} smoothness={2}>
          <Paint color={colors.primary} metalness={0.7} roughness={0.3} />
        </RoundedBox>
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.14, 0.05, 0.222]}>
            <mesh rotation={[HALF_PI, 0, 0]}>
              <cylinderGeometry args={[0.085, 0.085, 0.03, 28]} />
              <Glow color={colors.accent} />
            </mesh>
            <mesh>
              <torusGeometry args={[0.088, 0.016, 10, 32]} />
              <Chrome />
            </mesh>
          </group>
        ))}
        {[-0.09, -0.03, 0.03, 0.09].map((x) => (
          <mesh key={x} position={[x, -0.12, 0.222]}>
            <boxGeometry args={[0.025, 0.07, 0.01]} />
            <Frame />
          </mesh>
        ))}
        {SIDES.map((side) => (
          <group key={side}>
            <mesh position={[side * 0.31, 0, 0]} rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.07, 0.07, 0.05, 20]} />
              <Chrome />
            </mesh>
            <mesh position={[side * 0.15, 0.31, 0]}>
              <cylinderGeometry args={[0.01, 0.01, 0.2, 8]} />
              <Chrome />
            </mesh>
            <mesh position={[side * 0.15, 0.42, 0]}>
              <sphereGeometry args={[0.035, 14, 10]} />
              <Glow color={colors.accent} intensity={1.6} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Tay á»‘ng xáº¿p vĂ  cĂ ng káº¹p */}
      {SIDES.map((side) => (
        <group key={side} ref={side === 1 ? armLeft : armRight} position={[side * 0.47, 0.14, 0]}>
          <mesh rotation={[0, 0, HALF_PI]}>
            <cylinderGeometry args={[0.09, 0.09, 0.12, 24]} />
            <Chrome />
          </mesh>
          {BELLOWS.map((step) => (
            <mesh key={step} position={[side * 0.03, -0.1 - step * 0.075, 0]} rotation={[HALF_PI, 0, 0]}>
              <torusGeometry args={[0.045, 0.034, 10, 24]} />
              <Paint color={colors.secondary} metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[side * 0.03, -0.53, 0]} rotation={[0, HALF_PI, Math.PI * 1.25]}>
            <torusGeometry args={[0.07, 0.024, 10, 24, Math.PI * 1.5]} />
            <Chrome />
          </mesh>
        </group>
      ))}

      {/* ChĂ¬a khoĂ¡ dĂ¢y cĂ³t sau lÆ°ng */}
      <mesh position={[0, 0.02, -0.3]} rotation={[HALF_PI, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.022, 0.14, 12]} />
        <Chrome />
      </mesh>
      <group ref={windupKey} position={[0, 0.02, -0.38]}>
        {SIDES.map((side) => (
          <mesh key={side} position={[side * 0.085, 0, 0]}>
            <torusGeometry args={[0.065, 0.018, 10, 28]} />
            <Chrome />
          </mesh>
        ))}
      </group>
    </group>
  );
}
