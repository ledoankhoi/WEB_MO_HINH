"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import Link from "next/link";
import { Box, Camera, Crop, ImageUp, LoaderCircle, RotateCcw, ScanSearch, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { IMAGE_SEARCH_MODEL, type ImageSearchResponse } from "@/lib/image-search";
import { canRunModel, getEmbedder, isModelCached, type LoadProgress } from "./embedder";
import { readImageFile, toModelInput, type Rect } from "./pixels";
import { RegionPicker } from "./RegionPicker";
import { SearchResults, type SearchTrace } from "./SearchResults";

// YC-AI-01..04: khách chọn, kéo thả, dán hoặc chụp ảnh; trình duyệt trích đặc trưng (ảnh không rời máy) rồi
// gửi vector lên /api/tim-bang-anh để xếp hạng và quyết định.

type Stage =
  | { kind: "idle" }
  | { kind: "model"; progress: LoadProgress | null }
  | { kind: "embedding" }
  | { kind: "searching" }
  | { kind: "done"; response: ImageSearchResponse; trace: SearchTrace }
  | { kind: "error"; message: string };

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 0 });

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/Không tải được mô hình|Failed to fetch|NetworkError|network/i.test(message)) {
    return "Không tải được mô hình AI. Kiểm tra kết nối mạng rồi thử lại.";
  }
  if (/memory|Out of memory|allocation/i.test(message)) return "Máy không đủ bộ nhớ để chạy mô hình AI. Đóng bớt thẻ trình duyệt rồi thử lại.";
  return message || "Không tìm được, hãy thử lại.";
}

function Progress({ stage, products }: { stage: Stage; products: number }) {
  if (stage.kind === "model") {
    const total = stage.progress?.total || IMAGE_SEARCH_MODEL.megabytes * 1024 * 1024;
    const loaded = stage.progress?.loaded ?? 0;
    const initializing = stage.progress?.stage === "init";
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <p className="flex items-center gap-2 font-semibold">
          <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden />
          {initializing ? "Đang khởi động mô hình AI..." : "Đang tải mô hình AI..."}
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
  const text = stage.kind === "embedding" ? "Đang phân tích ảnh ngay trên máy bạn..." : `Đang so với ${products} mẫu trong cửa hàng...`;
  return (
    <p className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-5 font-semibold">
      <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden />
      {text}
    </p>
  );
}

function HowItWorks({ products }: { products: number }) {
  const steps = [
    { icon: ImageUp, title: "Bạn gửi một ảnh robot", text: "Ảnh chụp, ảnh tải trên mạng hay ảnh chụp màn hình đều được." },
    {
      icon: Box,
      title: "AI so với mô hình 3D",
      text: `Mỗi sản phẩm được dựng thành 12 góc nhìn từ mô hình 3D. AI so ảnh của bạn với ${products} mẫu đó.`,
    },
    { icon: ScanSearch, title: "Trả mẫu giống nhất", text: "Không đủ giống mẫu nào thì hệ thống nói rõ là chưa có, thay vì đoán bừa." },
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

export function ImageSearch({ products }: { products: number }) {
  const [picked, setPicked] = useState<HTMLCanvasElement | null>(null);
  const [region, setRegion] = useState<Rect | null>(null);
  // Vùng đã dùng ở lần tìm gần nhất, để biết khách vừa đổi vùng và cần tìm lại.
  const [searchedRegion, setSearchedRegion] = useState<Rect | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const [cached, setCached] = useState<boolean | null>(null);
  const runId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const supported = useSyncExternalStore(
    () => () => {},
    canRunModel,
    () => true,
  );
  const ready = products > 0;
  const busy = stage.kind === "model" || stage.kind === "embedding" || stage.kind === "searching";

  useEffect(() => {
    isModelCached().then(setCached);
  }, []);

  async function search(source: HTMLCanvasElement, area: Rect | null) {
    const id = ++runId.current;
    const current = () => id === runId.current;
    setSearchedRegion(area);
    try {
      const embedder = getEmbedder();
      const loadStarted = performance.now();
      setStage({ kind: "model", progress: null });
      const loaded = await embedder.load((progress) => current() && setStage({ kind: "model", progress }));
      const loadMs = performance.now() - loadStarted;
      if (!current()) return;
      setCached(true);

      setStage({ kind: "embedding" });
      const embedStarted = performance.now();
      const input = await toModelInput(source, area ?? undefined);
      const [vector] = await embedder.embedPixels([input.pixels]);
      const embedMs = performance.now() - embedStarted;
      if (!current()) return;

      setStage({ kind: "searching" });
      const serverStarted = performance.now();
      const response = await fetch("/api/tim-bang-anh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: IMAGE_SEARCH_MODEL.id,
          embedding: Array.from(vector, (value) => Math.round(value * 1e6) / 1e6),
          clientMs: Math.round(embedMs),
        }),
      });
      const body = (await response.json().catch(() => null)) as (ImageSearchResponse & { message?: string }) | null;
      const serverMs = performance.now() - serverStarted;
      if (!current()) return;
      if (!response.ok || !body) throw new Error(body?.message ?? "Không tìm được, hãy thử lại.");
      setStage({
        kind: "done",
        response: body,
        trace: {
          thumbnail: input.thumbnail,
          head: Array.from(vector.subarray(0, 6)),
          modelCached: loaded.cached,
          loadMs,
          embedMs,
          serverMs,
          cropped: area !== null,
        },
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
    // Tìm ngay với cả ảnh; khách khoanh vùng sau nếu cần.
    void search(canvas, null);
  }

  // Dán ảnh (Ctrl+V) ở bất kỳ đâu trên trang.
  useEffect(() => {
    if (!ready || !supported) return;
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
    if (busy || !ready) return;
    void pick(event.dataTransfer.files?.[0]);
  };

  const regionChanged = JSON.stringify(region) !== JSON.stringify(searchedRegion);
  const choose = () => fileInput.current?.click();

  if (!ready) {
    return (
      <Notice tone="info">
        Cửa hàng đang chuẩn bị tính năng tìm bằng ảnh. Trong lúc chờ, bạn có thể{" "}
        <Link href="/san-pham" className="font-medium underline">
          tìm mẫu theo tên
        </Link>
        .
      </Notice>
    );
  }
  if (!supported) {
    return <Notice tone="error">Trình duyệt này không chạy được mô hình AI (cần WebAssembly và Web Worker). Hãy mở trang bằng Chrome, Edge, Firefox hoặc Safari bản mới.</Notice>;
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section aria-label="Ảnh để tìm kiếm" className="space-y-4 lg:sticky lg:top-24">
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
          <div
            className={`space-y-3 rounded-2xl border bg-surface p-3 ${dragging ? "border-brand ring-2 ring-brand/25" : "border-line"}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <RegionPicker source={picked} region={region} onChange={setRegion} disabled={busy} />
            <p className="flex items-center gap-2 px-1 text-xs text-muted">
              <Crop className="size-3.5 shrink-0" aria-hidden />
              Ảnh có nhiều đồ vật? Kéo trên ảnh để khoanh vùng con robot rồi tìm lại.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => search(picked, region)} disabled={busy || !regionChanged}>
                <ScanSearch className="size-4" aria-hidden />
                Tìm lại với vùng đã chọn
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
          <div
            className={`grid min-h-80 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
              dragging ? "border-brand bg-brand/5" : "border-line bg-surface"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
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
                {/* Chỉ màn hình cảm ứng (điện thoại, máy tính bảng): mở máy ảnh. Ẩn bằng CSS để không nhấp nháy khi hydrate. */}
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
            Ảnh được phân tích ngay trên máy bạn. Cửa hàng chỉ nhận một dãy {IMAGE_SEARCH_MODEL.dim} con số đặc trưng, không nhận ảnh.
          </li>
          <li className="flex gap-2">
            <Box className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
            {cached === true
              ? "Mô hình AI đã có sẵn trên máy bạn."
              : `Lần đầu dùng, trình duyệt tải mô hình AI khoảng ${IMAGE_SEARCH_MODEL.megabytes} MB (chỉ một lần, nên dùng Wi-Fi).`}
          </li>
        </ul>
      </section>

      <section aria-live="polite" aria-busy={busy} className="min-w-0 space-y-4">
        {stage.kind === "idle" && <HowItWorks products={products} />}
        {busy && <Progress stage={stage} products={products} />}
        {stage.kind === "error" && (
          <div className="space-y-3">
            <Notice tone="error">{stage.message}</Notice>
            {picked && (
              <Button variant="secondary" size="sm" onClick={() => search(picked, region)}>
                <RotateCcw className="size-4" aria-hidden />
                Thử lại
              </Button>
            )}
          </div>
        )}
        {stage.kind === "done" && <SearchResults response={stage.response} trace={stage.trace} />}
      </section>
    </div>
  );
}
