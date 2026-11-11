"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { ContactShadows, Environment, Html, Lightformer, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  AnimationMixer,
  Box3,
  CanvasTexture,
  Color,
  DoubleSide,
  Matrix4,
  Raycaster,
  Vector3,
  type AnimationClip,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { RobotColors, RobotModelKey } from "@/lib/catalog";
import type { ModelFeatures, ModelPose } from "@/lib/model-features";
import { Robot } from "./robots";

export type ModelSource = {
  model: RobotModelKey;
  colors: RobotColors;
  // File .glb trong public/models hoặc trên kho media. Có giá trị thì hiển thị thay cho mô hình dựng bằng hình học.
  modelUrl?: string | null;
  // Clip biến hình và các dáng có sẵn của file .glb (src/lib/model-features.ts).
  features?: ModelFeatures | null;
  // Xưởng (src/lib/workshop.ts): màu sơn xem trước (nhân với màu gốc của chất liệu) và mức bóc tách linh kiện
  // (0 = lắp nguyên, 1 = tách xa nhất).
  tint?: string | null;
  explode?: number;
  // Xưởng: các tuỳ biến còn lại hiện trên mô hình 3D.
  look?: WorkshopLook;
};

// Tuỳ biến của Xưởng hiện trên khung 3D (khoá lựa chọn theo src/lib/workshop.ts).
export type WorkshopLook = {
  // Lớp hoàn thiện: "nham" | "bong" | "anh-kim" (đổi độ nhám, ánh kim của chất liệu).
  finish?: string | null;
  // Đế trưng bày: "luc-giac" | "luc-giac-led" (đế đặt dưới chân, bản LED có viền sáng và hắt đèn lên mô hình).
  stand?: string | null;
  // Đèn LED mắt và ngực (vị trí ước tính bằng tia chiếu vào mặt trước mô hình).
  led?: boolean;
  // Chữ in decal (hiện bằng nhãn chú thích ở vai).
  decal?: string | null;
  gift?: boolean;
  // Hiện nhãn chú thích từng tuỳ biến.
  labels?: boolean;
  // Phòng tối: giảm ánh sáng để thấy rõ đèn LED.
  dark?: boolean;
};

// Trạng thái do khung xem điều khiển: vị trí trên clip biến hình (0 = dạng đầu, 1 = dạng cuối) và dáng
// đang chọn (có dáng thì dáng được ưu tiên).
export type ModelControl = {
  progress: number;
  pose: ModelPose | null;
};

// Những gì file .glb thật sự hỗ trợ, báo lại cho khung xem để hiện đúng các nút.
export type ModelInfo = {
  transformSeconds: number | null;
  poses: ModelPose[];
  // Số khối linh kiện (mesh) bóc tách được.
  parts: number;
};

// Ánh sáng kiểu studio. Môi trường phản chiếu được dựng tại chỗ bằng các tấm sáng, không tải ảnh HDR
// từ máy chủ bên ngoài.
export function StudioLights({ dim = false }: { dim?: boolean }) {
  return (
    <>
      <ambientLight intensity={dim ? 0.06 : 0.35} />
      <directionalLight position={[4, 6, 5]} intensity={dim ? 0.18 : 1.5} />
      <directionalLight position={[-5, 3, -4]} intensity={dim ? 0.12 : 0.7} color="#8fd3ff" />
      <Environment resolution={256} frames={1} environmentIntensity={dim ? 0.12 : 1}>
        <color attach="background" args={["#c9ced6"]} />
        <Lightformer form="rect" intensity={3.2} position={[0, 6, 2]} scale={[7, 7, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[-6, 1.5, 2]} scale={[6, 3, 1]} color="#cfe8ff" />
        <Lightformer form="rect" intensity={1.6} position={[6, 1.5, 0]} scale={[6, 3, 1]} color="#ffe6cc" />
        <Lightformer form="ring" intensity={2.4} position={[0, 2, -7]} scale={3.5} />
      </Environment>
    </>
  );
}

// Chiều cao mô hình sau khi chuẩn hoá, và bề rộng tối đa còn nằm gọn trong khung nhìn mặc định.
const MODEL_SIZE = 2;
const VIEW_SPAN = 3.4;

// Độ dời đưa mô hình về giữa khung nhìn, chân chạm sàn.
type Anchor = [number, number, number];
// Số đoạn chia clip biến hình để đo vị trí; giữa hai mốc thì nội suy tuyến tính.
const ANCHOR_STEPS = 12;

// Hộp bao theo đỉnh đã biến dạng theo xương. Một số file có vài đỉnh hoặc bộ phận ẩn nằm rất xa mô hình;
// khi đó hộp chính xác phình to bất thường, nên thay bằng hộp bỏ 0,5% đỉnh xa nhất ở mỗi đầu.
export function measure(root: Object3D): Box3 {
  root.updateMatrixWorld(true);
  const exact = new Box3().setFromObject(root, true);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  const point = new Vector3();
  root.traverse((node) => {
    const mesh = node as SkinnedMesh;
    const position = mesh.isMesh ? mesh.geometry.getAttribute("position") : null;
    if (!position) return;
    const step = Math.max(1, Math.floor(position.count / 3000));
    for (let i = 0; i < position.count; i += step) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      xs.push(point.x);
      ys.push(point.y);
      zs.push(point.z);
    }
  });
  if (xs.length < 200) return exact;
  const trimmed = new Box3();
  const range = (values: number[]) => {
    values.sort((a, b) => a - b);
    const cut = Math.floor(values.length * 0.005);
    return [values[cut], values[values.length - 1 - cut]];
  };
  const [x, y, z] = [range(xs), range(ys), range(zs)];
  trimmed.min.set(x[0], y[0], z[0]);
  trimmed.max.set(x[1], y[1], z[1]);
  const span = (box: Box3) => Math.max(...box.getSize(new Vector3()).toArray());
  return span(exact) > span(trimmed) * 1.5 ? trimmed : exact;
}

// Ghi lại và khôi phục vị trí, góc xoay, tỉ lệ của mọi node trong mô hình.
export type Snapshot = [Object3D, Vector3, Object3D["quaternion"], Vector3][];

export function snapshot(root: Object3D): Snapshot {
  const nodes: Snapshot = [];
  root.traverse((node) => nodes.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
  return nodes;
}

export function restore(nodes: Snapshot) {
  for (const [node, position, quaternion, scale] of nodes) {
    node.position.copy(position);
    node.quaternion.copy(quaternion);
    node.scale.copy(scale);
  }
}

// Đặt mô hình vào đúng một thời điểm của clip rồi đứng yên ở đó (không phát liên tục).
export function poseAt(mixer: AnimationMixer, clip: AnimationClip, fraction: number) {
  mixer.stopAllAction();
  mixer.clipAction(clip).play();
  // Hoạt ảnh lặp vòng: đúng thời điểm cuối sẽ quay về khung đầu, nên dừng ngay trước đó.
  mixer.setTime(Math.min(clip.duration * Math.min(1, Math.max(0, fraction)), clip.duration - 1e-3));
}

// Đưa mô hình .glb về cùng quy ước với robot dựng sẵn: cao tối đa 2 đơn vị, đứng trên mặt y = -1.
function GlbModel({
  url,
  features,
  control,
  onInfo,
  tint = null,
  explode = 0,
  look,
}: {
  url: string;
  features?: ModelFeatures | null;
  control?: ModelControl;
  onInfo?: (info: ModelInfo) => void;
  tint?: string | null;
  explode?: number;
  look?: WorkshopLook;
}) {
  const { scene, animations } = useGLTF(url, false, true);
  const groupRef = useRef<Group>(null);
  const eyeLeft = useRef<Group>(null);
  const eyeRight = useRef<Group>(null);
  const chest = useRef<Group>(null);
  const shoulder = useRef<Group>(null);
  const glow = useMemo(() => glowTexture(), []);
  const showLed = look?.led ?? false;
  const decal = look?.decal ?? null;
  const finish = look?.finish ?? null;
  const interactive = control !== undefined;
  // onBeforeRender đọc mức bóc tách từ ref, không cần dựng lại mô hình khi kéo thanh trượt.
  const explodeRef = useRef(explode);
  useEffect(() => {
    explodeRef.current = explode;
  }, [explode]);

  const model = useMemo(() => {
    // clone() thường làm mesh có khung xương (skinned) vẫn bám vào xương của bản gốc, nên hiển thị và đo sai.
    const object = cloneWithSkeleton(scene);
    // Chất liệu riêng cho bản sao này: phủ màu ở Xưởng không làm đổi màu mô hình ở khung xem khác (useGLTF dùng chung).
    // Kèm độ nhám, độ kim loại gốc (chất liệu PBR) để đổi theo lớp hoàn thiện rồi trả lại khi bỏ chọn.
    const tintable: { material: Material & { color: Color }; base: Color; rough?: number; metal?: number }[] = [];
    const meshes: Mesh[] = [];
    object.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      meshes.push(mesh);
      const cloned = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => material.clone());
      mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
      for (const material of cloned) {
        const color = (material as Material & { color?: Color }).color;
        const pbr = material as Material & { roughness?: number; metalness?: number };
        if (color instanceof Color) {
          tintable.push({ material: material as Material & { color: Color }, base: color.clone(), rough: pbr.roughness, metal: pbr.metalness });
        }
      }
    });
    const mixer = new AnimationMixer(object);
    const findClip = (name: string | undefined) => animations.find((clip) => clip.name === name) ?? null;
    const transformClip = findClip(features?.transform?.clip);
    const poses = (features?.poses ?? []).filter((pose) => findClip(pose.clip));

    // Vùng bao của mesh có xương không tự cập nhật theo hoạt ảnh, nên có thể bị ẩn nhầm khi bộ phận di
    // chuyển xa vị trí gốc. Chỉ có một mô hình trong cảnh nên luôn vẽ.
    object.traverse((node) => {
      if ((node as SkinnedMesh).isSkinnedMesh) node.frustumCulled = false;
    });
    const rest = snapshot(object);
    // Mọi dáng và mọi mốc biến hình đều dựng lại từ tư thế gốc, để khúc xương mà clip này không điều khiển
    // không giữ giá trị của clip trước.
    const showPose = (pose: ModelPose) => {
      mixer.stopAllAction();
      restore(rest);
      poseAt(mixer, findClip(pose.clip)!, pose.at);
    };

    // Tỉ lệ lấy theo dáng đứng đầu tiên; không có thì theo dạng cuối của clip biến hình (dạng robot hoặc
    // dạng đã hợp thể), hoặc tư thế gốc của file.
    if (poses[0]) showPose(poses[0]);
    else if (transformClip) poseAt(mixer, transformClip, 1);
    const whole = measure(object);
    const size = whole.getSize(new Vector3());

    // Bóc tách linh kiện (Xưởng): mỗi khối dời ra xa tâm mô hình theo hướng từ tâm tới tâm khối. Mô hình có khung xương
    // nên không dời bằng position được (hai ma trận triệt tiêu nhau); thay vào đó cộng một phép dời vào matrixWorld ngay
    // trước khi vẽ và trả lại ngay sau khi vẽ (đổ bóng cũng vẽ lại, nên phải trả lại mỗi lần).
    const center = whole.getCenter(new Vector3());
    const offsets = new Map<Mesh, Vector3>();
    for (const mesh of meshes) {
      const part = new Box3().setFromObject(mesh, true);
      if (part.isEmpty()) continue;
      offsets.set(mesh, part.getCenter(new Vector3()).sub(center).multiplyScalar(1.4));
    }
    const saved = new Matrix4();
    const shift = new Matrix4();
    const origin = new Vector3();
    const shifted = new Vector3();
    for (const [mesh, offset] of offsets) {
      mesh.onBeforeRender = () => {
        const amount = explodeRef.current;
        if (amount <= 0) return;
        saved.copy(mesh.matrixWorld);
        // Đổi độ dời từ toạ độ mô hình sang toạ độ thế giới (đã gồm tỉ lệ thu phóng của nhóm cha).
        origin.setFromMatrixPosition(object.matrixWorld);
        shifted.copy(offset).multiplyScalar(amount).applyMatrix4(object.matrixWorld).sub(origin);
        mesh.matrixWorld.premultiply(shift.makeTranslation(shifted.x, shifted.y, shifted.z));
      };
      mesh.onAfterRender = () => {
        if (explodeRef.current > 0) mesh.matrixWorld.copy(saved);
      };
    }
    // Có bảng nút phía trên khung nhìn thì mô hình thấp hơn một chút để không bị che.
    const target = interactive && (transformClip || poses.length > 0) ? MODEL_SIZE * 0.85 : MODEL_SIZE;
    let scale = target / Math.max(size.x, size.y, size.z, 0.0001);

    // Mỗi clip đặt nhân vật ở một vị trí riêng, nên vị trí được căn theo từng trạng thái: giữa khung nhìn,
    // chân chạm sàn.
    const anchor = (box: Box3): Anchor => {
      const center = box.getCenter(new Vector3());
      return [-center.x, -box.min.y, -center.z];
    };
    const poseAnchors = new Map<string, Anchor>();
    for (const pose of poses) {
      showPose(pose);
      poseAnchors.set(pose.label, anchor(measure(object)));
    }
    mixer.stopAllAction();
    restore(rest);
    // Clip biến hình: nhân vật có thể bay, nhảy hoặc toả các bộ phận ra xa. Đo ở nhiều mốc đều nhau để
    // (1) căn lại vị trí liên tục theo tiến trình và (2) thu nhỏ sao cho mốc rộng nhất vẫn nằm trong khung
    // nhìn, nhưng không nhỏ quá 55% (người xem tự lùi camera nếu cần).
    const transformAnchors: Anchor[] = [];
    if (transformClip) {
      const boxes: Box3[] = [];
      for (let step = 0; step <= ANCHOR_STEPS; step++) {
        poseAt(mixer, transformClip, step / ANCHOR_STEPS);
        boxes.push(measure(object));
      }
      const end = boxes[ANCHOR_STEPS];
      let span = 0;
      if (features?.transform?.kind === "combine") {
        // Hợp thể: các thành viên bay vào từ nhiều phía và có mảnh phụ chờ sẵn dưới sàn, nên giữ khung
        // nhìn cố định theo dạng đã ghép xong.
        const center = end.getCenter(new Vector3());
        for (const box of boxes) {
          transformAnchors.push(anchor(end));
          span = Math.max(
            span,
            box.max.y - end.min.y,
            2 * Math.max(center.x - box.min.x, box.max.x - center.x, center.z - box.min.z, box.max.z - center.z),
          );
        }
      } else {
        for (const box of boxes) {
          transformAnchors.push(anchor(box));
          span = Math.max(span, ...box.getSize(new Vector3()).toArray());
        }
      }
      // Ảnh đại diện (không có điều khiển) chỉ hiện dạng cuối nên giữ nguyên cỡ.
      if (interactive) scale = Math.max(scale * 0.55, Math.min(scale, VIEW_SPAN / Math.max(span, 0.0001)));
    } else {
      mixer.stopAllAction();
      transformAnchors.push(anchor(measure(object)));
    }

    return {
      object,
      mixer,
      findClip,
      transformClip,
      rest,
      showPose,
      scale,
      transformAnchors,
      poseAnchors,
      tintable,
      info: { transformSeconds: transformClip?.duration ?? null, poses, parts: offsets.size } satisfies ModelInfo,
    };
  }, [scene, animations, features, interactive]);

  useEffect(() => onInfo?.(model.info), [model, onInfo]);

  // Màu sơn xem trước: thay màu gốc của chất liệu (nhân với texture), bỏ chọn thì trả lại màu gốc. Lớp hoàn thiện đổi
  // độ nhám, độ kim loại: nhám (mờ, không loá), bóng (loá rõ), ánh kim (phản chiếu như kim loại).
  useLayoutEffect(() => {
    for (const { material, base, rough, metal } of model.tintable) {
      if (tint) material.color.set(tint);
      else material.color.copy(base);
      applyFinish(material, finish, rough, metal);
    }
  }, [model, tint, finish]);

  const progress = control?.progress ?? 1;
  const pose = control?.pose ?? null;

  useLayoutEffect(() => {
    const { mixer, rest, findClip, transformClip, info } = model;
    // Về tư thế gốc trước, để khúc xương mà clip mới không điều khiển không giữ giá trị của clip trước.
    mixer.stopAllAction();
    restore(rest);
    // Dáng mặc định là dáng đứng đầu tiên, trừ khi khung xem đang điều khiển clip biến hình.
    const shown = pose ?? (transformClip && interactive ? null : (info.poses[0] ?? null));
    const poseClip = shown ? findClip(shown.clip) : null;
    // Vị trí trên clip biến hình: nội suy giữa hai mốc đã đo gần nhất.
    const anchors = model.transformAnchors;
    const at = Math.min(1, Math.max(0, progress)) * (anchors.length - 1);
    const from = anchors[Math.floor(at)];
    const to = anchors[Math.ceil(at)];
    const mix = at - Math.floor(at);
    let place: Anchor = [0, 1, 2].map((axis) => from[axis] + (to[axis] - from[axis]) * mix) as Anchor;
    if (shown && poseClip) {
      model.showPose(shown);
      place = model.poseAnchors.get(shown.label) ?? anchors[anchors.length - 1];
    } else if (transformClip) {
      poseAt(mixer, transformClip, progress);
    }
    model.object.position.set(...place);
  }, [model, progress, pose, interactive]);

  // Vị trí đèn LED mắt, ngực và decal ở vai: bắn tia từ phía trước vào mô hình ở độ cao ước tính theo hộp bao (mắt gần
  // đỉnh, ngực khoảng 1/3 từ trên xuống), lấy điểm chạm bề mặt; không chạm thì dùng mặt trước hộp bao. Tính lại khi đổi
  // dáng hoặc tiến trình biến hình.
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || (!showLed && !decal)) return;
    group.updateWorldMatrix(true, true);
    const box = measure(model.object);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const ray = new Raycaster();
    const surface = (x: number, y: number) => {
      ray.set(new Vector3(x, y, box.max.z + size.z + 1), new Vector3(0, 0, -1));
      const hit = ray.intersectObject(model.object, true)[0];
      const point = hit ? hit.point.clone() : new Vector3(x, y, box.max.z);
      point.z += size.y * 0.02;
      return group.worldToLocal(point);
    };
    const place = (ref: { current: Group | null }, x: number, y: number) => ref.current?.position.copy(surface(x, y));
    place(eyeLeft, center.x - size.x * 0.045, box.max.y - size.y * 0.085);
    place(eyeRight, center.x + size.x * 0.045, box.max.y - size.y * 0.085);
    place(chest, center.x, box.max.y - size.y * 0.32);
    place(shoulder, box.min.x + size.x * 0.16, box.max.y - size.y * 0.24);
  }, [model, progress, pose, interactive, showLed, decal]);

  // Cỡ đốm sáng tính theo đơn vị của cảnh (nhóm mô hình đã thu phóng theo model.scale).
  const unit = 1 / model.scale;
  // Nhãn chú thích; `side`: lệch sang phải để không đè nhãn decal ở vai bên trái.
  const label = (text: string, side = false) =>
    look?.labels ? (
      <Html center zIndexRange={[20, 0]} className="pointer-events-none" style={{ transform: side ? "translate(70%, 0)" : "translateY(-150%)" }}>
        <span className="block border-2 border-ink bg-[#ffd23f] px-1.5 py-0.5 font-condensed text-xs font-black whitespace-nowrap text-ink uppercase shadow-[2px_2px_0_var(--color-ink)]">
          {text}
        </span>
      </Html>
    ) : null;

  return (
    <group ref={groupRef} position={[0, -1, 0]} scale={model.scale}>
      <primitive object={model.object} />
      {showLed && (
        <>
          <group ref={eyeLeft}>
            <sprite scale={0.16 * unit}>
              <spriteMaterial map={glow} color="#5ff7ff" blending={AdditiveBlending} depthWrite={false} transparent />
            </sprite>
            {label("Đèn LED mắt")}
          </group>
          <group ref={eyeRight}>
            <sprite scale={0.16 * unit}>
              <spriteMaterial map={glow} color="#5ff7ff" blending={AdditiveBlending} depthWrite={false} transparent />
            </sprite>
          </group>
          <group ref={chest}>
            <sprite scale={0.34 * unit}>
              <spriteMaterial map={glow} color="#5ff7ff" blending={AdditiveBlending} depthWrite={false} transparent />
            </sprite>
            <pointLight color="#5ff7ff" intensity={2.5} distance={1.4} />
            {label("Đèn LED ngực", true)}
          </group>
        </>
      )}
      {decal && <group ref={shoulder}>{look?.labels !== false && <DecalTag text={decal} />}</group>}
    </group>
  );
}

// Nhãn decal tên riêng ở vai mô hình (decal nước thật dán ở vai hoặc chân).
function DecalTag({ text }: { text: string }) {
  return (
    <Html center zIndexRange={[20, 0]} className="pointer-events-none">
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="size-2.5 rounded-full border-2 border-ink bg-brand" />
        <span className="border-2 border-ink bg-surface px-1.5 py-0.5 font-mono text-xs font-bold tracking-widest text-ink shadow-[2px_2px_0_var(--color-ink)]">
          {text}
        </span>
      </span>
    </Html>
  );
}

// Lớp hoàn thiện của Xưởng trên chất liệu PBR: nhám (mờ, không loá), bóng (loá rõ), ánh kim (phản chiếu như kim loại);
// không chọn thì trả độ nhám, độ kim loại gốc.
function applyFinish(material: Material, finish: string | null, rough: number | undefined, metal: number | undefined) {
  const pbr = material as Material & { roughness?: number; metalness?: number };
  if (rough === undefined || metal === undefined) return;
  pbr.roughness = finish === "nham" ? Math.max(rough, 0.9) : finish === "bong" ? 0.1 : finish === "anh-kim" ? 0.22 : rough;
  pbr.metalness = finish === "anh-kim" ? 0.9 : finish === "nham" ? Math.min(metal, 0.15) : metal;
}

// Đốm sáng tròn mờ dần (đèn LED): vẽ một lần bằng canvas, cộng sáng lên cảnh.
function glowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

// Đế trưng bày lục giác: thân đen bóng, mặt mica trong; bản có đèn LED có viền phát sáng và hắt đèn lên mô hình. Mặt đế
// ngang chân mô hình (y = -1).
function DisplayStand({ led, labels }: { led: boolean; labels: boolean }) {
  return (
    <group position={[0, -1, 0]}>
      <mesh position={[0, -0.09, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[1.05, 1.13, 0.16, 6]} />
        <meshStandardMaterial color="#151515" roughness={0.3} metalness={0.45} />
      </mesh>
      <mesh position={[0, -0.005, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[1.0, 1.0, 0.012, 6]} />
        <meshStandardMaterial color="#dfe9ff" roughness={0.05} metalness={0.1} transparent opacity={0.55} />
      </mesh>
      {led && (
        <>
          <mesh position={[0, -0.09, 0]} rotation={[0, Math.PI / 6, 0]}>
            <cylinderGeometry args={[1.1, 1.1, 0.035, 6, 1, true]} />
            <meshBasicMaterial color="#3df2ff" side={DoubleSide} toneMapped={false} />
          </mesh>
          <pointLight position={[0, 0.25, 0.9]} color="#3df2ff" intensity={5} distance={3.2} />
          <pointLight position={[0, 0.25, -0.9]} color="#3df2ff" intensity={3} distance={3.2} />
        </>
      )}
      {labels && (
        <group position={[0.85, -0.1, 0.75]}>
          <Html center zIndexRange={[20, 0]} className="pointer-events-none">
            <span className="block border-2 border-ink bg-[#ffd23f] px-1.5 py-0.5 font-condensed text-xs font-black whitespace-nowrap text-ink uppercase shadow-[2px_2px_0_var(--color-ink)]">
              {led ? "Đế lục giác có đèn LED" : "Đế lục giác"}
            </span>
          </Html>
        </group>
      )}
    </group>
  );
}

// Hộp quà cứng màu đỏ có ruy băng vàng, đặt cạnh mô hình.
function GiftBox({ labels }: { labels: boolean }) {
  const ribbon = <meshStandardMaterial color="#ffd23f" roughness={0.4} />;
  return (
    <group position={[1.32, -1, 0.45]} rotation={[0, -0.5, 0]}>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[0.42, 0.42, 0.42]} />
        <meshStandardMaterial color="#d7261e" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[0.44, 0.44, 0.07]} />
        {ribbon}
      </mesh>
      <mesh position={[0, 0.21, 0]}>
        <boxGeometry args={[0.07, 0.44, 0.44]} />
        {ribbon}
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.06, 0.46, 0]} rotation={[Math.PI / 2, side * 0.6, 0]}>
          <torusGeometry args={[0.065, 0.02, 8, 16]} />
          {ribbon}
        </mesh>
      ))}
      {labels && (
        <group position={[0, 0.62, 0]}>
          <Html center zIndexRange={[20, 0]} className="pointer-events-none">
            <span className="block border-2 border-ink bg-[#ffd23f] px-1.5 py-0.5 font-condensed text-xs font-black whitespace-nowrap text-ink uppercase shadow-[2px_2px_0_var(--color-ink)]">
              Hộp quà
            </span>
          </Html>
        </group>
      )}
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

export function RobotSubject({
  model,
  colors,
  modelUrl,
  features,
  tint,
  explode,
  look,
  animate = true,
  control,
  onInfo,
}: ModelSource & { animate?: boolean; control?: ModelControl; onInfo?: (info: ModelInfo) => void }) {
  // Khung nhìn dọc (điện thoại) hẹp hơn mô hình: thu nhỏ để không bị cắt hai bên.
  const aspect = useThree((state) => state.viewport.aspect);
  const scale = Math.min(1, aspect * 0.95);
  const robot = <Robot model={model} colors={colors} animate={animate} />;

  return (
    <group scale={scale}>
      {modelUrl ? (
        <ModelBoundary key={modelUrl} fallback={robot}>
          <Suspense fallback={null}>
            <GlbModel url={modelUrl} features={features} control={control} onInfo={onInfo} tint={tint} explode={explode} look={look} />
          </Suspense>
        </ModelBoundary>
      ) : (
        robot
      )}
      {look?.stand && <DisplayStand led={look.stand === "luc-giac-led"} labels={look.labels ?? false} />}
      {look?.gift && <GiftBox labels={look.labels ?? false} />}
      <ContactShadows position={[0, look?.stand ? -1.175 : -1.005, 0]} opacity={0.6} scale={6} blur={2.4} far={2.4} resolution={512} />
    </group>
  );
}
