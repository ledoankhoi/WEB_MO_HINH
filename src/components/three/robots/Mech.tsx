"use client";

import { useRef } from "react";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { Beam, Chrome, Frame, Glass, Glow, Paint, Strut } from "../parts";
import type { RobotProps } from "./types";

const SIDES = [-1, 1] as const;
const TUBE_ROWS = [-0.1, 0, 0.1] as const;
const HALF_PI = Math.PI / 2;

export default function Mech({ colors, animate = true }: RobotProps) {
  const torso = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!animate || !torso.current) return;
    const t = clock.elapsedTime;
    torso.current.rotation.y = Math.sin(t * 0.5) * 0.22;
    torso.current.position.y = 0.36 + Math.sin(t * 1.4) * 0.01;
  });

  return (
    <group>
      {/* Chân khớp ngược */}
      {SIDES.map((side) => {
        const x = side * 0.4;
        return (
          <group key={side}>
            <mesh position={[x, -0.04, 0]} rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.15, 0.15, 0.22, 28]} />
              <Frame />
            </mesh>
            <RoundedBox args={[0.12, 0.3, 0.36]} radius={0.04} smoothness={3} position={[x + side * 0.14, -0.02, 0]}>
              <Paint color={colors.primary} />
            </RoundedBox>
            <Beam from={[x, -0.06, 0.02]} to={[x, -0.4, 0.26]} width={0.2} depth={0.2}>
              <Frame color={colors.secondary} />
            </Beam>
            <mesh position={[x, -0.42, 0.27]} rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.12, 0.12, 0.26, 24]} />
              <Frame />
            </mesh>
            <RoundedBox args={[0.22, 0.2, 0.1]} radius={0.04} smoothness={3} position={[x, -0.42, 0.39]}>
              <Paint color={colors.primary} />
            </RoundedBox>
            <Beam from={[x, -0.44, 0.25]} to={[x, -0.84, -0.04]} width={0.22} depth={0.24}>
              <Paint color={colors.primary} />
            </Beam>
            <Strut from={[x, -0.14, -0.1]} to={[x, -0.72, -0.16]} radius={0.022}>
              <Chrome />
            </Strut>
            <mesh position={[x, -0.86, -0.04]} rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.09, 0.09, 0.28, 20]} />
              <Frame />
            </mesh>
            <RoundedBox args={[0.34, 0.14, 0.6]} radius={0.05} smoothness={3} position={[x, -0.93, 0.08]}>
              <Frame color={colors.secondary} />
            </RoundedBox>
            {SIDES.map((toe) => (
              <RoundedBox
                key={toe}
                args={[0.13, 0.1, 0.18]}
                radius={0.035}
                smoothness={3}
                position={[x + toe * 0.09, -0.95, 0.43]}
              >
                <Paint color={colors.primary} />
              </RoundedBox>
            ))}
          </group>
        );
      })}

      {/* Hông và mâm xoay */}
      <RoundedBox args={[0.56, 0.22, 0.42]} radius={0.07} smoothness={3} position={[0, -0.02, 0]}>
        <Frame color={colors.secondary} />
      </RoundedBox>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.26, 0.28, 0.1, 32]} />
        <Frame />
      </mesh>

      <group ref={torso} position={[0, 0.36, 0]}>
        {/* Thân và buồng lái */}
        <RoundedBox args={[0.84, 0.46, 0.76]} radius={0.1} smoothness={4}>
          <Paint color={colors.primary} />
        </RoundedBox>
        <mesh position={[0, -0.21, 0]}>
          <boxGeometry args={[0.86, 0.06, 0.78]} />
          <Frame />
        </mesh>
        <RoundedBox args={[0.5, 0.24, 0.3]} radius={0.08} smoothness={4} position={[0, 0.11, 0.31]} rotation={[-0.38, 0, 0]}>
          <Glass color="#0a1626" />
        </RoundedBox>
        <mesh position={[0, -0.04, 0.383]}>
          <boxGeometry args={[0.42, 0.022, 0.012]} />
          <Glow color={colors.accent} />
        </mesh>
        {SIDES.map((side) => (
          <mesh key={side} position={[side * 0.31, -0.12, 0.383]} rotation={[HALF_PI, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.02, 20]} />
            <Glow color="#fff7e0" intensity={1.8} />
          </mesh>
        ))}
        <mesh position={[0, 0.245, -0.1]}>
          <cylinderGeometry args={[0.15, 0.15, 0.04, 28]} />
          <Frame />
        </mesh>

        {/* Ống xả và ăng-ten */}
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.2, 0.33, -0.33]}>
            <mesh>
              <cylinderGeometry args={[0.055, 0.065, 0.26, 20]} />
              <Frame />
            </mesh>
            <mesh position={[0, 0.132, 0]}>
              <cylinderGeometry args={[0.04, 0.04, 0.01, 20]} />
              <Glow color={colors.accent} intensity={1.6} />
            </mesh>
          </group>
        ))}
        <mesh position={[-0.33, 0.45, -0.28]}>
          <cylinderGeometry args={[0.008, 0.008, 0.46, 8]} />
          <Chrome />
        </mesh>
        <mesh position={[-0.33, 0.69, -0.28]}>
          <sphereGeometry args={[0.022, 12, 10]} />
          <Glow color={colors.accent} />
        </mesh>

        {/* Cụm tên lửa hai vai */}
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.66, 0.1, 0]}>
            <mesh position={[-side * 0.2, 0, 0]} rotation={[0, 0, HALF_PI]}>
              <cylinderGeometry args={[0.1, 0.1, 0.14, 20]} />
              <Frame />
            </mesh>
            <RoundedBox args={[0.36, 0.42, 0.52]} radius={0.07} smoothness={3}>
              <Paint color={colors.primary} />
            </RoundedBox>
            <mesh position={[0, 0, 0.262]}>
              <boxGeometry args={[0.3, 0.34, 0.02]} />
              <Frame />
            </mesh>
            {SIDES.map((column) =>
              TUBE_ROWS.map((row) => (
                <mesh key={`${column}-${row}`} position={[column * 0.07, row, 0.275]} rotation={[HALF_PI, 0, 0]}>
                  <cylinderGeometry args={[0.036, 0.036, 0.012, 16]} />
                  <Glow color={colors.accent} intensity={0.9} />
                </mesh>
              )),
            )}
          </group>
        ))}

        {/* Vũ khí: pháo chính bên trái, nòng đôi bên phải */}
        {SIDES.map((side) => (
          <group key={side} position={[side * 0.66, -0.2, 0]}>
            <RoundedBox args={[0.2, 0.18, 0.32]} radius={0.05} smoothness={3} position={[0, 0, 0.04]}>
              <Frame color={colors.secondary} />
            </RoundedBox>
            {side === 1 ? (
              <>
                <mesh position={[0, 0, 0.46]} rotation={[HALF_PI, 0, 0]}>
                  <cylinderGeometry args={[0.055, 0.065, 0.56, 20]} />
                  <Frame />
                </mesh>
                <mesh position={[0, 0, 0.76]} rotation={[HALF_PI, 0, 0]}>
                  <cylinderGeometry args={[0.075, 0.075, 0.1, 20]} />
                  <Chrome />
                </mesh>
              </>
            ) : (
              SIDES.map((barrel) => (
                <mesh key={barrel} position={[barrel * 0.055, 0, 0.4]} rotation={[HALF_PI, 0, 0]}>
                  <cylinderGeometry args={[0.038, 0.038, 0.44, 16]} />
                  <Frame />
                </mesh>
              ))
            )}
          </group>
        ))}
      </group>
    </group>
  );
}
