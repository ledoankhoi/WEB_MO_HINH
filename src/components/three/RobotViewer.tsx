"use client";

import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactNode,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Combine, Minus, Pause, Play, Plus, Repeat, RotateCcw } from "lucide-react";
import type { ModelPose } from "@/lib/model-features";
import { RobotSubject, StudioLights, type ModelControl, type ModelInfo, type ModelSource } from "./Stage";

const MIN_DISTANCE = 3.2;
const MAX_DISTANCE = 9;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Controls = ComponentRef<typeof OrbitControls>;

// Đưa camera lại gần (factor < 1) hoặc ra xa (factor > 1) quanh điểm đang nhìn.
function dolly(controls: Controls | null, factor: number) {
  if (!controls) return;
  const offset = controls.object.position.clone().sub(controls.target);
  offset.setLength(Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, offset.length() * factor)));
  controls.object.position.copy(controls.target).add(offset);
  controls.update();
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Trình duyệt không hỗ trợ WebGL (hoặc mất ngữ cảnh đồ hoạ) thì hiện nội dung thay thế.
class WebGLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type RobotViewerProps = ModelSource & {
  label: string;
  // Ẩn các nút điều khiển, dùng cho khung trang trí.
  bare?: boolean;
  onReady?: () => void;
};

const roundButton =
  "grid size-9 place-items-center rounded-full border border-line bg-bg/80 text-fg backdrop-blur transition hover:border-brand hover:text-brand";
const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap backdrop-blur transition";
const chipOff = `${chip} border-line bg-bg/85 text-fg hover:border-brand hover:text-brand`;
const chipOn = `${chip} border-fg bg-fg text-bg`;
const formButton = `${chip} border-brand bg-brand text-brand-ink hover:brightness-95`;

export default function RobotViewer({ label, bare = false, onReady, ...source }: RobotViewerProps) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const [spinChoice, setSpinChoice] = useState<boolean | null>(null);
  const [inView, setInView] = useState(true);
  const [touched, setTouched] = useState(false);
  // Next.js giữ lại trang cũ ở trạng thái ẩn khi điều hướng. Đổi key để dựng khung vẽ mới khi trang
  // hiện trở lại, vì ngữ cảnh WebGL cũ đã được giải phóng lúc ẩn.
  const [epoch, setEpoch] = useState(0);
  useLayoutEffect(() => () => setEpoch((value) => value + 1), []);

  // Đổi dạng (biến hình, hợp thể) và chọn dáng có sẵn. `info` cho biết file .glb thật sự hỗ trợ những gì.
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [progress, setProgress] = useState(1);
  const progressRef = useRef(1);
  const [playTo, setPlayTo] = useState<0 | 1 | null>(null);
  const [pose, setPose] = useState<ModelPose | null>(null);

  const transform = info?.transformSeconds ? source.features?.transform : undefined;
  const poses = info?.poses ?? [];
  const control = useMemo<ModelControl>(() => ({ progress, pose }), [progress, pose]);
  // Mô hình có dáng có sẵn thì mở đầu ở dáng đầu tiên (dáng đứng).
  const onInfo = useCallback((value: ModelInfo) => {
    setInfo(value);
    setPose(value.poses[0] ?? null);
  }, []);

  const moveTo = (value: number) => {
    progressRef.current = value;
    setProgress(value);
  };

  // Phát clip biến hình về phía `playTo`, mỗi khung hình tiến một đoạn theo thời lượng thật của clip.
  useEffect(() => {
    const seconds = info?.transformSeconds;
    if (playTo === null || !seconds) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) / 1000 / seconds;
      last = now;
      const next = playTo === 1 ? Math.min(1, progressRef.current + step) : Math.max(0, progressRef.current - step);
      progressRef.current = next;
      setProgress(next);
      if (next === playTo) setPlayTo(null);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playTo, info]);

  // Đang ở dạng cuối (robot, hoặc đã hợp thể), hoặc đang chạy về đó.
  const atEnd = playTo !== null ? playTo === 1 : progress >= 0.5;

  // Bấm khi đang chạy thì quay ngược lại từ đúng vị trí hiện tại.
  const toggleForm = () => {
    const target = atEnd ? 0 : 1;
    setPose(null);
    if (reducedMotion) {
      // Người dùng tắt hiệu ứng chuyển động: nhảy thẳng tới dạng đích.
      setPlayTo(null);
      moveTo(target);
    } else setPlayTo(target);
  };

  // Dáng có sẵn luôn ở dạng robot hoàn chỉnh.
  const choosePose = (item: ModelPose) => {
    setPlayTo(null);
    moveTo(1);
    setPose(item);
  };

  // Mặc định đứng yên; người xem tự bật xoay nếu muốn.
  const spin = spinChoice ?? false;

  // Ngừng vẽ khi khung nhìn nằm ngoài màn hình để tiết kiệm pin.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Cuộn chuột bình thường vẫn cuộn trang. Chỉ phóng to khi giữ Ctrl (cũng là cử chỉ chụm hai ngón
  // trên bàn di chuột).
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      dolly(controls.current, event.deltaY > 0 ? 1.08 : 0.92);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const combine = transform?.kind === "combine";
  const formLabel = combine
    ? atEnd
      ? "Tách ra"
      : "Hợp thể"
    : atEnd
      ? `Về ${transform?.from.toLowerCase() ?? ""}`
      : "Biến thành robot";

  return (
    <div ref={container} role="group" aria-label={label} className="viewer-surface relative size-full select-none">
      <WebGLBoundary
        fallback={
          <p className="grid size-full place-items-center p-6 text-center text-sm text-muted">
            Thiết bị này không hiển thị được mô hình 3D.
          </p>
        }
      >
        <Canvas
          key={epoch}
          dpr={[1, 2]}
          frameloop={inView ? "always" : "never"}
          camera={{ position: [3, 1.2, 4.5], fov: 32 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          onCreated={() => onReady?.()}
        >
          <StudioLights />
          <RobotSubject {...source} animate={!reducedMotion} control={control} onInfo={onInfo} />
          <OrbitControls
            ref={controls}
            makeDefault
            enablePan={false}
            enableZoom={false}
            enableDamping
            minDistance={MIN_DISTANCE}
            maxDistance={MAX_DISTANCE}
            minPolarAngle={0.3}
            maxPolarAngle={Math.PI / 2 + 0.12}
            autoRotate={spin}
            autoRotateSpeed={1.3}
            onStart={() => {
              setTouched(true);
              setSpinChoice(false);
            }}
          />
        </Canvas>
      </WebGLBoundary>

      {!bare && (transform || poses.length > 0) && (
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-1.5">
          {transform && (
            <button type="button" className={formButton} onClick={toggleForm}>
              {combine ? <Combine className="size-3.5" aria-hidden /> : <Repeat className="size-3.5" aria-hidden />}
              {formLabel}
            </button>
          )}
          {poses.length > 0 && (
            <div role="group" aria-label="Chọn dáng" className="flex flex-wrap gap-1.5">
              {poses.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={pose?.label === item.label ? chipOn : chipOff}
                  aria-pressed={pose?.label === item.label}
                  onClick={() => choosePose(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!bare && (
        <>
          <p
            className={`pointer-events-none absolute bottom-4 left-4 rounded-full border border-line bg-bg/80 px-3 py-1.5 text-xs text-muted backdrop-blur transition-opacity duration-500 ${touched ? "opacity-0" : "opacity-100"}`}
          >
            Kéo để xoay mô hình
          </p>
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <button type="button" className={roundButton} onClick={() => dolly(controls.current, 1.2)} aria-label="Thu nhỏ">
              <Minus className="size-4" aria-hidden />
            </button>
            <button type="button" className={roundButton} onClick={() => dolly(controls.current, 0.82)} aria-label="Phóng to">
              <Plus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={roundButton}
              onClick={() => setSpinChoice(!spin)}
              aria-label={spin ? "Dừng tự xoay" : "Tự xoay"}
              aria-pressed={spin}
            >
              {spin ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              className={roundButton}
              onClick={() => controls.current?.reset()}
              aria-label="Về góc nhìn ban đầu"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
