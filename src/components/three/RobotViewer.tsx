"use client";

import {
  Component,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
  type ReactNode,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { RobotSubject, StudioLights, type ModelSource } from "./Stage";

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

  const buttonClass =
    "grid size-9 place-items-center rounded-full border border-line bg-bg/80 text-fg backdrop-blur transition hover:border-brand hover:text-brand";

  return (
    <div ref={container} role="img" aria-label={label} className="viewer-surface relative size-full select-none">
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
          <RobotSubject {...source} animate={!reducedMotion} />
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

      {!bare && (
        <>
          <p
            className={`pointer-events-none absolute bottom-4 left-4 rounded-full border border-line bg-bg/80 px-3 py-1.5 text-xs text-muted backdrop-blur transition-opacity duration-500 ${touched ? "opacity-0" : "opacity-100"}`}
          >
            Kéo để xoay mô hình
          </p>
          <div className="absolute right-3 bottom-3 flex gap-1.5">
            <button type="button" className={buttonClass} onClick={() => dolly(controls.current, 1.2)} aria-label="Thu nhỏ">
              <Minus className="size-4" aria-hidden />
            </button>
            <button type="button" className={buttonClass} onClick={() => dolly(controls.current, 0.82)} aria-label="Phóng to">
              <Plus className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setSpinChoice(!spin)}
              aria-label={spin ? "Dừng tự xoay" : "Tự xoay"}
              aria-pressed={spin}
            >
              {spin ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            </button>
            <button
              type="button"
              className={buttonClass}
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
