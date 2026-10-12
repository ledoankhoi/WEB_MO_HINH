"use client";

import { Component, Suspense, useMemo, type ReactNode } from "react";
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Box3, Vector3 } from "three";
import type { RobotColors, RobotModelKey } from "@/lib/catalog";
import { Robot } from "./robots";

export type ModelSource = {
  model: RobotModelKey;
  colors: RobotColors;
  // File .glb trong public/models. Có giá trị thì hiển thị thay cho mô hình dựng bằng hình học.
  modelUrl?: string | null;
};

// Ánh sáng kiểu studio. Môi trường phản chiếu được dựng tại chỗ bằng các tấm sáng, không tải ảnh HDR
// từ máy chủ bên ngoài.
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.5} />
      <directionalLight position={[-5, 3, -4]} intensity={0.7} color="#8fd3ff" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#c9ced6"]} />
        <Lightformer form="rect" intensity={3.2} position={[0, 6, 2]} scale={[7, 7, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[-6, 1.5, 2]} scale={[6, 3, 1]} color="#cfe8ff" />
        <Lightformer form="rect" intensity={1.6} position={[6, 1.5, 0]} scale={[6, 3, 1]} color="#ffe6cc" />
        <Lightformer form="ring" intensity={2.4} position={[0, 2, -7]} scale={3.5} />
      </Environment>
    </>
  );
}

// Đưa mô hình .glb về cùng quy ước với robot dựng sẵn: cao tối đa 2 đơn vị, đứng trên mặt y = -1.
function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url, false, true);
  const { object, scale, offset } = useMemo(() => {
    const clone = scene.clone(true);
    const box = new Box3().setFromObject(clone);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    return {
      object: clone,
      scale: 2 / Math.max(size.x, size.y, size.z, 0.0001),
      offset: [-center.x, -box.min.y, -center.z] as [number, number, number],
    };
  }, [scene]);

  return (
    <group position={[0, -1, 0]} scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

// File .glb thiếu hoặc hỏng thì quay về mô hình dựng bằng hình học thay vì làm sập cả khung nhìn.
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RobotSubject({ model, colors, modelUrl, animate = true }: ModelSource & { animate?: boolean }) {
  // Khung nhìn dọc (điện thoại) hẹp hơn mô hình: thu nhỏ để không bị cắt hai bên.
  const aspect = useThree((state) => state.viewport.aspect);
  const scale = Math.min(1, aspect * 0.95);
  const robot = <Robot model={model} colors={colors} animate={animate} />;

  return (
    <group scale={scale}>
      {modelUrl ? (
        <ModelBoundary key={modelUrl} fallback={robot}>
          <Suspense fallback={null}>
            <GlbModel url={modelUrl} />
          </Suspense>
        </ModelBoundary>
      ) : (
        robot
      )}
      <ContactShadows position={[0, -1.005, 0]} opacity={0.6} scale={6} blur={2.4} far={2.4} resolution={512} />
    </group>
  );
}
