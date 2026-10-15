"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { AnimationMixer, Box3, Vector3, type AnimationClip, type Object3D, type SkinnedMesh } from "three";
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

// Chiều cao mô hình sau khi chuẩn hoá, và bề rộng tối đa còn nằm gọn trong khung nhìn mặc định.
const MODEL_SIZE = 2;
const VIEW_SPAN = 3.4;

// Độ dời đưa mô hình về giữa khung nhìn, chân chạm sàn.
type Anchor = [number, number, number];
// Số đoạn chia clip biến hình để đo vị trí; giữa hai mốc thì nội suy tuyến tính.
const ANCHOR_STEPS = 12;

// Hộp bao theo đỉnh đã biến dạng theo xương. Một số file có vài đỉnh hoặc bộ phận ẩn nằm rất xa mô hình;
// khi đó hộp chính xác phình to bất thường, nên thay bằng hộp bỏ 0,5% đỉnh xa nhất ở mỗi đầu.
function measure(root: Object3D): Box3 {
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
type Snapshot = [Object3D, Vector3, Object3D["quaternion"], Vector3][];

function snapshot(root: Object3D): Snapshot {
  const nodes: Snapshot = [];
  root.traverse((node) => nodes.push([node, node.position.clone(), node.quaternion.clone(), node.scale.clone()]));
  return nodes;
}

function restore(nodes: Snapshot) {
  for (const [node, position, quaternion, scale] of nodes) {
    node.position.copy(position);
    node.quaternion.copy(quaternion);
    node.scale.copy(scale);
  }
}

// Đặt mô hình vào đúng một thời điểm của clip rồi đứng yên ở đó (không phát liên tục).
function poseAt(mixer: AnimationMixer, clip: AnimationClip, fraction: number) {
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
}: {
  url: string;
  features?: ModelFeatures | null;
  control?: ModelControl;
  onInfo?: (info: ModelInfo) => void;
}) {
  const { scene, animations } = useGLTF(url, false, true);
  const interactive = control !== undefined;

  const model = useMemo(() => {
    // clone() thường làm mesh có khung xương (skinned) vẫn bám vào xương của bản gốc, nên hiển thị và đo sai.
    const object = cloneWithSkeleton(scene);
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
    const size = measure(object).getSize(new Vector3());
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
      info: { transformSeconds: transformClip?.duration ?? null, poses } satisfies ModelInfo,
    };
  }, [scene, animations, features, interactive]);

  useEffect(() => onInfo?.(model.info), [model, onInfo]);

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

  return (
    <group position={[0, -1, 0]} scale={model.scale}>
      <primitive object={model.object} />
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
            <GlbModel url={modelUrl} features={features} control={control} onInfo={onInfo} />
          </Suspense>
        </ModelBoundary>
      ) : (
        robot
      )}
      <ContactShadows position={[0, -1.005, 0]} opacity={0.6} scale={6} blur={2.4} far={2.4} resolution={512} />
    </group>
  );
}
