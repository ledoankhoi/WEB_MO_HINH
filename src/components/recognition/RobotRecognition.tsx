"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { Box, Camera, Crop, ExternalLink, ImageUp, LoaderCircle, RotateCcw, ScanSearch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ProductGrid } from "@/components/product/ProductCard";
import { canRunModel, type LoadProgress } from "@/components/image-search/embedder";
import { readImageFile, type Rect } from "@/components/image-search/pixels";
import { RegionPicker } from "@/components/image-search/RegionPicker";
import { buildHierarchy, recognize, type RecognitionLabel, type RecognitionResult } from "@/lib/recognition";
import { roundProbability, type RecognitionResponse } from "@/lib/recognition-api";
import type { ModelInput } from "@/lib/recognition-import";
import { getClassifier, isClassifierCached, prepareFromCanvas, preparedToDataUrl, type ClassifierModel } from "./classifier";

// B11: khách gửi ảnh robot; trình duyệt chạy mô hình phân loại (ảnh không rời máy), gửi xác suất lên /api/nhan-dien để lấy thông tin
// robot và sản phẩm đang bán. Luật trả lời theo cấp chạy ở cả hai phía bằng cùng một hàm (src/lib/recognition.ts).

export type RecognitionModelProps = {
  id: string;
  label: string;
  files: string[];
  mb: number;
  input: ModelInput;
  temperature: number;
  thresholds: [number, number, number];
  labels: RecognitionLabel[];
};

type Trace = { thumbnail: string; resize: number; local: RecognitionResult; modelCached: boolean; loadMs: number; inferMs: number; serverMs: number; cropped: boolean };

type Stage =
  | { kind: "idle" }
  | { kind: "model"; progress: LoadProgress | null }
  | { kind: "running" }
  | { kind: "asking" }
  | { kind: "done"; response: RecognitionResponse; trace: Trace }
  | { kind: "error"; message: string };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const percent = (p: number) => `${(p * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 0 });
const ms = (value: number) => `${Math.round(value).toLocaleString("vi-VN")} ms`;

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Không tải được mô hình|Failed to fetch|NetworkError|network/i.test(message)) return "Không tải được mô hình AI. Kiểm tra kết nối mạng rồi thử lại.";
  if (/memory|allocation/i.test(message)) return "Máy không đủ bộ nhớ để chạy mô hình AI. Đóng bớt thẻ trình duyệt rồi thử lại.";
  return message || "Không nhận dạng được, hãy thử lại.";
}

function Progress({ stage, mb }: { stage: Stage; mb: number }) {
  if (stage.kind === "model") {
    const total = stage.progress?.total || mb * 1024 * 1024;
    const loaded = stage.progress?.loaded ?? 0;
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold">
          <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden />
          {stage.progress?.stage === "init" ? "Đang khởi động mô hình AI..." : "Đang tải mô hình AI..."}
        </p>
        <div className="h-2.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((loaded / total) * 100)}>
          <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (loaded / total) * 100)}%` }} />
        </div>
        <p className="text-sm text-muted">
          {megabytes(loaded)} / {megabytes(total)} MB. Chỉ tải lần đầu, những lần sau dùng ngay bản đã lưu trên máy bạn.
        </p>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-5 font-semibold">
      <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden />
      {stage.kind === "running" ? "Đang phân tích ảnh ngay trên máy bạn..." : "Đang tra thông tin robot..."}
    </p>
  );
}

function Headline({ response }: { response: RecognitionResponse }) {
  const { level, robot, character, franchise, pClass } = response;
  if (level === "none") {
    return (
      <div className="space-y-2 rounded-2xl border border-line bg-surface p-5">
        <p className="text-xl font-bold">Chưa nhận ra robot trong ảnh</p>
        <p className="text-sm text-muted">
          Có thể robot này chưa có trong danh sách của hệ thống, hoặc ảnh chưa rõ. Thử khoanh vùng sát con robot, chụp thẳng mặt, đủ sáng, rồi gửi lại.
        </p>
      </div>
    );
  }
  const [title, detail, p] =
    level === "class"
      ? [robot.name, [robot.series, robot.faction, robot.franchiseLabel].filter(Boolean).join(" · "), pClass]
      : level === "character"
        ? [character.name, `${franchise.label} · chưa chắc là dòng nào`, character.p]
        : [`một robot ${franchise.label}`, "Chưa nhận ra là nhân vật nào", franchise.p];
  return (
    <div className="space-y-1 rounded-2xl border border-brand/40 bg-brand/5 p-5">
      <p className="text-sm font-semibold text-brand-strong">{level === "class" ? "Đây là" : "Có vẻ là"}</p>
      <p className="text-2xl font-bold tracking-tight">{title}</p>
      <p className="text-sm text-muted">{detail}</p>
      <p className="pt-1 text-sm">
        Độ tin: <span className="font-semibold">{percent(p)}</span>
      </p>
    </div>
  );
}

function RobotInfo({ response }: { response: RecognitionResponse }) {
  const { robot, level } = response;
  if (level !== "class" && level !== "character") return null;
  const rows = [
    ["Dòng", robot.series],
    ["Phe", robot.faction],
    ["Dạng biến hình", robot.altMode],
  ].filter(([, value]) => value);
  return (
    <div className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
      {robot.image && (
        // Ảnh lấy từ trang wiki nguồn (ghi ở B1), không qua máy chủ của cửa hàng.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={robot.image} alt={robot.name} loading="lazy" referrerPolicy="no-referrer" className="size-28 shrink-0 rounded-xl bg-raised object-contain" />
      )}
      <div className="min-w-0 space-y-2 text-sm">
        {level === "character" && <p className="font-semibold">Dòng giống nhất: {robot.name}</p>}
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {rows.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {robot.description && <p className="line-clamp-4 text-muted">{robot.description}</p>}
        {robot.sourceUrl && (
          <a href={robot.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-strong underline">
            Xem trên wiki nguồn <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

function Explain({ response, trace, labels }: { response: RecognitionResponse; trace: Trace; labels: RecognitionLabel[] }) {
  const [t1, t2, t3] = response.thresholds;
  return (
    <details className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-4 text-brand-strong" aria-hidden />
        Hệ thống quyết định thế nào?
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4 text-sm">
        <div className="flex gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={trace.thumbnail} alt="Ảnh đưa vào mô hình" className="size-28 shrink-0 rounded-lg border border-line" />
          <p className="text-muted">
            Ảnh {trace.cropped ? "(vùng đã khoanh) " : ""}được thu cạnh ngắn về {trace.resize} điểm ảnh rồi cắt giữa thành hình vuông như bên trái, đúng cách xử lý ảnh lúc
            huấn luyện. Mô hình cho mỗi robot một xác suất; chỉ các xác suất này được gửi lên cửa hàng, ảnh thì không.
          </p>
        </div>
        <table className="w-full text-left">
          <thead className="text-muted">
            <tr>
              <th className="py-1 font-medium">5 robot có xác suất cao nhất</th>
              <th className="py-1 text-right font-medium">Xác suất</th>
            </tr>
          </thead>
          <tbody>
            {trace.local.alternatives.map(({ index, p }) => (
              <tr key={index} className="border-t border-line">
                <td className="py-1">{labels[index]?.name}</td>
                <td className="py-1 text-right tabular-nums">{percent(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="space-y-1 text-muted">
          <li>
            Trả lời đúng tên và dòng khi xác suất của robot ≥ {percent(t1)} (ở đây {percent(response.pClass)}).
          </li>
          <li>
            Không thì trả lời tên nhân vật khi tổng xác suất các dòng của nhân vật đó ≥ {percent(t2)} (ở đây {percent(response.character.p)}).
          </li>
          <li>
            Không thì trả lời thương hiệu khi tổng xác suất của thương hiệu ≥ {percent(t3)} (ở đây {percent(response.franchise.p)}); còn lại là &quot;chưa nhận ra&quot;.
          </li>
          <li>
            Thời gian: tải mô hình {trace.modelCached ? "(đã có sẵn) " : ""}
            {ms(trace.loadMs)}, phân tích ảnh {ms(trace.inferMs)}, tra thông tin {ms(trace.serverMs)}.
          </li>
        </ul>
      </div>
    </details>
  );
}

function Results({ response, trace, labels }: { response: RecognitionResponse; trace: Trace; labels: RecognitionLabel[] }) {
  return (
    <div className="space-y-4">
      <Headline response={response} />
      <RobotInfo response={response} />
      {response.alternatives.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold">{response.level === "none" ? "Gần giống nhất" : "Có thể là"}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {response.alternatives.map((alt) => (
              <li key={alt.slug} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{alt.name}</span>
                  <span className="block truncate text-xs text-muted">{alt.franchiseLabel}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted">{percent(alt.p)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {response.products.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold">Cửa hàng có bán</h2>
          <ProductGrid products={response.products} columns={3} />
        </div>
      )}
      <Explain response={response} trace={trace} labels={labels} />
    </div>
  );
}

function HowItWorks({ classes }: { classes: number }) {
  const steps = [
    { icon: ImageUp, title: "Bạn gửi một ảnh robot", text: "Ảnh chụp mô hình, ảnh trên mạng hay ảnh chụp màn hình phim đều được." },
    { icon: ScanSearch, title: "AI nhận dạng ngay trên máy bạn", text: `Mô hình được huấn luyện trên hàng chục nghìn ảnh của ${classes} robot Transformers, Gundam, Super Sentai.` },
    { icon: Box, title: "Cho biết robot nào và gợi ý mô hình", text: "Không chắc thì hệ thống nói ở mức chắc chắn nhất (nhân vật, thương hiệu) thay vì đoán bừa." },
  ];
  return (
    <ol className="grid gap-3">
      {steps.map(({ icon: Icon, title, text }, index) => (
        <li key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand-strong">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">
              {index + 1}. {title}
            </p>
            <p className="text-sm text-muted">{text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function RobotRecognition({ model }: { model: RecognitionModelProps }) {
  const [picked, setPicked] = useState<HTMLCanvasElement | null>(null);
  const [region, setRegion] = useState<Rect | null>(null);
  const [usedRegion, setUsedRegion] = useState<Rect | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [cached, setCached] = useState<boolean | null>(null);
  const runId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const hierarchy = useRef(buildHierarchy(model.labels));
  const classifierModel: ClassifierModel = { id: model.id, files: model.files, input: model.input, classes: model.labels.length };
  const supported = useSyncExternalStore(
    () => () => {},
    canRunModel,
    () => true,
  );
  const busy = stage.kind === "model" || stage.kind === "running" || stage.kind === "asking";

  useEffect(() => {
    isClassifierCached({ id: model.id, files: model.files, input: model.input, classes: model.labels.length }).then(setCached);
  }, [model.id, model.files, model.input, model.labels.length]);

  async function run(source: HTMLCanvasElement, area: Rect | null) {
    const id = ++runId.current;
    const current = () => id === runId.current;
    setUsedRegion(area);
    try {
      const classifier = getClassifier();
      const loadStarted = performance.now();
      setStage({ kind: "model", progress: null });
      const loaded = await classifier.load(classifierModel, (progress) => current() && setStage({ kind: "model", progress }));
      const loadMs = performance.now() - loadStarted;
      if (!current()) return;
      setCached(true);

      setStage({ kind: "running" });
      const started = performance.now();
      const prepared = prepareFromCanvas(source, model.input, area ?? undefined);
      const { logits } = await classifier.logits(classifierModel, prepared);
      const local = recognize(logits, hierarchy.current, model.temperature, model.thresholds, 5);
      const inferMs = performance.now() - started;
      if (!current()) return;

      setStage({ kind: "asking" });
      const serverStarted = performance.now();
      const res = await fetch("/api/nhan-dien", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, probs: local.probabilities.map(roundProbability), clientMs: Math.round(inferMs) }),
      });
      const body = (await res.json().catch(() => null)) as (RecognitionResponse & { message?: string }) | null;
      const serverMs = performance.now() - serverStarted;
      if (!current()) return;
      if (!res.ok || !body) throw new Error(body?.message ?? "Không nhận dạng được, hãy thử lại.");
      setStage({
        kind: "done",
        response: body,
        trace: { thumbnail: preparedToDataUrl(prepared), resize: model.input.resize, local, modelCached: loaded.cached, loadMs, inferMs, serverMs, cropped: area !== null },
      });
    } catch (error) {
      if (current()) setStage({ kind: "error", message: describeError(error) });
    }
  }

  async function pick(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStage({ kind: "error", message: "Hãy chọn một file ảnh (JPG, PNG, WebP...)." });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStage({ kind: "error", message: "Ảnh quá lớn, hãy chọn ảnh dưới 25 MB." });
      return;
    }
    let canvas: HTMLCanvasElement;
    try {
      canvas = await readImageFile(file);
    } catch {
      setStage({ kind: "error", message: "Không đọc được ảnh này. Hãy thử ảnh JPG, PNG hoặc WebP khác." });
      return;
    }
    setPicked(canvas);
    setRegion(null);
    void run(canvas, null);
  }

  useEffect(() => {
    if (!supported) return;
    const onPaste = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
      if (!item) return;
      event.preventDefault();
      void pick(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (!busy) void pick(event.dataTransfer.files?.[0]);
  };
  const dragProps = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };
  const regionChanged = JSON.stringify(region) !== JSON.stringify(usedRegion);
  const choose = () => fileInput.current?.click();

  if (!supported) {
    return <Notice tone="error">Trình duyệt này không chạy được mô hình AI (cần WebAssembly và Web Worker). Hãy mở trang bằng Chrome, Edge, Firefox hoặc Safari bản mới.</Notice>;
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section aria-label="Ảnh để nhận dạng" className="space-y-4 lg:sticky lg:top-24">
        <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(event) => void pick(event.target.files?.[0]).finally(() => (event.target.value = ""))} />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void pick(event.target.files?.[0]).finally(() => (event.target.value = ""))}
        />
        {picked ? (
          <div className={`space-y-3 rounded-2xl border bg-surface p-3 ${dragging ? "border-brand ring-2 ring-brand/25" : "border-line"}`} {...dragProps}>
            <RegionPicker source={picked} region={region} onChange={setRegion} disabled={busy} />
            <p className="flex items-center gap-2 px-1 text-xs text-muted">
              <Crop className="size-3.5 shrink-0" aria-hidden />
              Ảnh có nhiều đồ vật? Kéo trên ảnh để khoanh vùng con robot rồi nhận dạng lại.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => run(picked, region)} disabled={busy || !regionChanged}>
                <ScanSearch className="size-4" aria-hidden />
                Nhận dạng vùng đã chọn
              </Button>
              {region && (
                <Button size="sm" variant="secondary" onClick={() => setRegion(null)} disabled={busy}>
                  Dùng cả ảnh
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={choose} disabled={busy}>
                <RotateCcw className="size-4" aria-hidden />
                Chọn ảnh khác
              </Button>
            </div>
          </div>
        ) : (
          <div className={`grid min-h-80 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-brand bg-brand/5" : "border-line bg-surface"}`} {...dragProps}>
            <div className="space-y-4">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-brand/10 text-brand-strong">
                <ImageUp className="size-7" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-lg font-semibold">Kéo ảnh robot vào đây</p>
                <p className="text-sm text-muted">hoặc dán ảnh (Ctrl + V), hoặc chọn từ máy</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={choose}>
                  <ImageUp className="size-4" aria-hidden />
                  Chọn ảnh
                </Button>
                <span className="hidden pointer-coarse:contents">
                  <Button variant="secondary" onClick={() => cameraInput.current?.click()}>
                    <Camera className="size-4" aria-hidden />
                    Chụp ảnh
                  </Button>
                </span>
              </div>
            </div>
          </div>
        )}
        <ul className="space-y-2 text-sm text-muted">
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Ảnh được phân tích ngay trên máy bạn. Cửa hàng chỉ nhận xác suất của từng robot, không nhận ảnh.
          </li>
          <li className="flex gap-2">
            <Box className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
            {cached === true ? "Mô hình AI đã có sẵn trên máy bạn." : `Lần đầu dùng, trình duyệt tải mô hình AI khoảng ${Math.round(model.mb)} MB (chỉ một lần, nên dùng Wi-Fi).`}
          </li>
        </ul>
      </section>

      <section aria-live="polite" aria-busy={busy} className="min-w-0 space-y-4">
        {stage.kind === "idle" && <HowItWorks classes={model.labels.length} />}
        {busy && <Progress stage={stage} mb={model.mb} />}
        {stage.kind === "error" && (
          <div className="space-y-3">
            <Notice tone="error">{stage.message}</Notice>
            {picked && (
              <Button variant="secondary" size="sm" onClick={() => run(picked, region)}>
                <RotateCcw className="size-4" aria-hidden />
                Thử lại
              </Button>
            )}
          </div>
        )}
        {stage.kind === "done" && <Results response={stage.response} trace={stage.trace} labels={model.labels} />}
      </section>
    </div>
  );
}
