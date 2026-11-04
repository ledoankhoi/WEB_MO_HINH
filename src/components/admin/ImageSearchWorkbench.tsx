"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Download, LoaderCircle, Play, Square, Trash2 } from "lucide-react";
import { deleteImageIndexAction, loadCalibrationAction, saveImageIndexAction, saveThresholdsAction } from "@/app/actions/image-search";
import { BADGE, Empty, TABLE, TABLE_WRAP } from "@/components/admin/parts";
import { getEmbedder, type LoadProgress } from "@/components/image-search/embedder";
import { calibrateProduct, decodeGallery, indexModel } from "@/components/image-search/indexer";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { showToast } from "@/components/ui/Toaster";
import { formatDateTime } from "@/lib/format";
import { IMAGE_SEARCH_MODEL, calibrateThresholds, encodeVector, type CalibrationResult, type FormKey } from "@/lib/image-search";
import { closedSet, recordsToCsv, toSamples, type QueryRecord } from "@/lib/image-search-eval";
import type { CalibrationSummary, ImageSearchSettings, IndexStatusRow, IndexedFormStatus } from "@/server/repo/image-search";

// YC-AI-05, 06: lập chỉ mục và hiệu chỉnh ngưỡng chạy ngay trong trình duyệt của quản trị (dựng ảnh từ file
// .glb bằng three.js, trích đặc trưng bằng mô hình ONNX). Hai việc dùng chung một khung vẽ WebGL và một worker
// nên chỉ chạy một việc mỗi lúc.

const decimal = (value: number, digits = 3) => value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value: number) => `${(value * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const FORM_NAMES: Record<FormKey, string> = { default: "Dạng chính", alt: "Dạng biến hình" };

type Running = {
  kind: "index" | "calibrate";
  done: number;
  total: number;
  current: string;
  // Ảnh vừa dựng của sản phẩm đang chạy (xem trước).
  thumbnails: string[];
  model: LoadProgress | null;
  startedAt: number;
};

type CalibrationRun = { summary: CalibrationSummary; records: QueryRecord[]; names: Map<string, string>; finishedAt: number };

function isOutdated(row: IndexStatusRow) {
  return row.forms.length > 0 && row.forms.some((form) => form.sourceUrl !== (row.modelUrl ?? ""));
}

function FormList({ forms, outdated }: { forms: IndexedFormStatus[]; outdated: boolean }) {
  if (forms.length === 0) return <span className="text-muted">Chưa lập</span>;
  return (
    <div className="space-y-1">
      {forms.map((form) => (
        <p key={form.form} className="whitespace-nowrap">
          <span className="font-medium">{form.label || FORM_NAMES[form.form]}</span>{" "}
          <span className="text-muted">
            · {form.views} góc · nhất quán {decimal(form.consistency)}
          </span>
        </p>
      ))}
      {outdated && (
        <p className="flex items-center gap-1 text-xs font-medium text-warning">
          <CircleAlert className="size-3.5" aria-hidden /> Mô hình 3D đã đổi, cần lập lại
        </p>
      )}
    </div>
  );
}

function RatesTable({ result, maxview }: { result: CalibrationResult; maxview?: CalibrationSummary["maxview"] }) {
  const rows: [string, (r: CalibrationResult["select"]) => string][] = [
    ["Trả đúng sản phẩm", (r) => pct(r.correctAccept)],
    ["Trả sai sản phẩm", (r) => pct(r.wrongAccept)],
    ["Từ chối oan", (r) => pct(r.falseReject)],
    ["Chấp nhận nhầm hàng không bán (FAR)", (r) => pct(r.falseAccept)],
    ["Số ảnh (có bán / không bán)", (r) => `${r.known} / ${r.unknown}`],
  ];
  return (
    <div className={TABLE_WRAP}>
      <table className={TABLE}>
        <thead>
          <tr>
            <th scope="col">Chỉ số</th>
            <th scope="col">Trung bình · chọn ngưỡng</th>
            <th scope="col">Trung bình · kiểm tra</th>
            {maxview && <th scope="col">Maxview · kiểm tra</th>}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ngưỡng τ / δ</td>
            <td className="tabular-nums" colSpan={2}>
              τ = {decimal(result.tau)}, δ = {decimal(result.delta, 4)}
            </td>
            {maxview && (
              <td className="tabular-nums">
                τ = {decimal(maxview.tau)}, δ = {decimal(maxview.delta, 4)}
              </td>
            )}
          </tr>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td className="tabular-nums">{value(result.select)}</td>
              <td className="font-semibold tabular-nums">{value(result.test)}</td>
              {maxview && <td className="tabular-nums">{value(maxview.test)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Phân bố s₁ của ảnh có bán (đúng hạng 1) và ảnh "không bán" (bỏ chính sản phẩm khỏi thư viện), vạch là τ.
function ScoreHistogram({ records, tau }: { records: QueryRecord[]; tau: number }) {
  const known = records.filter((r) => r.pooling === "mean" && r.rank === 1).map((r) => r.s1);
  const unknown = records.filter((r) => r.pooling === "mean").map((r) => r.looS1);
  const all = [...known, ...unknown, tau];
  if (known.length + unknown.length === 0) return null;
  const min = Math.max(0, Math.floor(Math.min(...all) * 20) / 20);
  const max = Math.min(1, Math.ceil(Math.max(...all) * 20) / 20);
  const bins = 30;
  const width = 600;
  const height = 150;
  const step = (max - min) / bins || 1;
  const count = (values: number[]) => {
    const out = new Array(bins).fill(0);
    for (const value of values) out[Math.min(bins - 1, Math.max(0, Math.floor((value - min) / step)))]++;
    return out;
  };
  const a = count(known);
  const b = count(unknown);
  const top = Math.max(1, ...a, ...b);
  const x = (value: number) => ((value - min) / (max - min || 1)) * width;
  const bar = width / bins;
  return (
    <figure className="space-y-2 rounded-xl border border-line bg-surface p-4">
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="h-auto w-full" role="img" aria-label="Phân bố điểm s₁ của ảnh có bán và ảnh không bán">
        {a.map((n, i) => (
          <rect key={`a${i}`} x={i * bar + 1} y={height - (n / top) * height} width={bar / 2 - 1} height={(n / top) * height} className="fill-brand" />
        ))}
        {b.map((n, i) => (
          <rect key={`b${i}`} x={i * bar + bar / 2} y={height - (n / top) * height} width={bar / 2 - 1} height={(n / top) * height} className="fill-danger/70" />
        ))}
        <line x1={x(tau)} x2={x(tau)} y1={0} y2={height} className="stroke-fg" strokeWidth={2} strokeDasharray="4 3" />
        <text x={Math.min(width - 60, x(tau) + 4)} y={12} className="fill-fg text-[9px]">
          τ = {decimal(tau)}
        </text>
        <text x={0} y={height + 14} className="fill-muted text-[9px]">
          {decimal(min, 2)}
        </text>
        <text x={width} y={height + 14} textAnchor="end" className="fill-muted text-[9px]">
          {decimal(max, 2)}
        </text>
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand" /> s₁ của ảnh có bán, tìm đúng ({known.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-danger/70" /> s₁ khi sản phẩm bị bỏ khỏi thư viện, tức hàng không bán ({unknown.length})
        </span>
      </figcaption>
    </figure>
  );
}

export function ImageSearchWorkbench({ rows, settings, canEdit }: { rows: IndexStatusRow[]; settings: ImageSearchSettings; canEdit: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState<Running | null>(null);
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([]);
  // Kết quả lập chỉ mục trong phiên này, hiện ngay trước khi trang tải lại dữ liệu.
  const [fresh, setFresh] = useState<Map<string, IndexedFormStatus[]>>(new Map());
  const [calibration, setCalibration] = useState<CalibrationRun | null>(null);
  const [perProduct, setPerProduct] = useState(8);
  const [farMax, setFarMax] = useState(0.05);
  const [seed, setSeed] = useState(2026);
  const [saving, setSaving] = useState(false);
  const stop = useRef(false);

  const table = rows.map((row) => (fresh.has(row.productId) ? { ...row, forms: fresh.get(row.productId)! } : row));
  const withModel = table.filter((row) => row.modelUrl);
  const pending = withModel.filter((row) => row.forms.length === 0 || isOutdated(row));
  const indexed = table.filter((row) => row.forms.length > 0 && !isOutdated(row));
  const busy = running !== null;

  // Chỉ hiện tiến độ khi thật sự đang tải (lần đầu); có sẵn trong bộ nhớ đệm thì bỏ qua.
  const loadModel = () =>
    getEmbedder().load((progress) => setRunning((state) => (state ? { ...state, model: progress.total > 0 && progress.loaded < progress.total ? progress : null } : state)));

  async function runIndex(targets: IndexStatusRow[]) {
    if (targets.length === 0) return;
    stop.current = false;
    setErrors([]);
    setRunning({ kind: "index", done: 0, total: targets.length, current: "Đang chuẩn bị mô hình AI...", thumbnails: [], model: null, startedAt: Date.now() });
    try {
      await loadModel();
      for (const [index, row] of targets.entries()) {
        if (stop.current) break;
        setRunning((state) => state && { ...state, done: index, current: row.name, thumbnails: [], model: null });
        try {
          const forms = await indexModel(row.modelUrl!, (form, thumbnail, view) =>
            setRunning((state) => {
              if (!state) return state;
              const thumbnails = view === 0 ? [] : [...state.thumbnails];
              thumbnails[view] = thumbnail;
              return { ...state, current: `${row.name} · ${FORM_NAMES[form]}`, thumbnails };
            }),
          );
          const result = await saveImageIndexAction({
            productId: row.productId,
            model: IMAGE_SEARCH_MODEL.id,
            sourceUrl: row.modelUrl!,
            forms: forms.map((form) => ({ form: form.form, label: form.label, views: form.views.map(encodeVector) })),
          });
          if (!result.ok || !result.forms) throw new Error(result.message ?? "Không lưu được chỉ mục.");
          const now = Date.now();
          const saved = result.forms.map((item) => {
            const form = forms.find((f) => f.form === item.form)!;
            return { form: item.form, label: form.label, views: form.views.length, consistency: item.consistency, sourceUrl: row.modelUrl!, createdAt: now };
          });
          setFresh((map) => new Map(map).set(row.productId, saved));
        } catch (error) {
          setErrors((list) => [...list, { name: row.name, message: error instanceof Error ? error.message : String(error) }]);
        }
      }
      showToast(stop.current ? "Đã dừng lập chỉ mục." : "Đã lập chỉ mục xong.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không chạy được mô hình AI.", { tone: "error" });
    } finally {
      setRunning(null);
      router.refresh();
    }
  }

  async function runCalibration() {
    stop.current = false;
    setErrors([]);
    setRunning({ kind: "calibrate", done: 0, total: 0, current: "Đang tải chỉ mục...", thumbnails: [], model: null, startedAt: Date.now() });
    try {
      const loaded = await loadCalibrationAction();
      if (!("entries" in loaded)) throw new Error(loaded.message ?? "Không tải được chỉ mục.");
      const gallery = decodeGallery(loaded.entries);
      const owners = gallery.filter((entry) => entry.modelUrl);
      if (owners.length < 2) throw new Error("Cần ít nhất 2 sản phẩm đang bán đã lập chỉ mục để hiệu chỉnh.");
      setRunning((state) => state && { ...state, total: owners.length, current: "Đang chuẩn bị mô hình AI..." });
      await loadModel();
      const records: QueryRecord[] = [];
      for (const [index, owner] of owners.entries()) {
        if (stop.current) break;
        setRunning((state) => state && { ...state, done: index, current: owner.name, thumbnails: [], model: null });
        try {
          records.push(
            ...(await calibrateProduct(owner, gallery, perProduct, seed, (thumbnail, view) =>
              setRunning((state) => {
                if (!state) return state;
                const thumbnails = [...state.thumbnails];
                thumbnails[view] = thumbnail;
                return { ...state, thumbnails };
              }),
            )),
          );
        } catch (error) {
          setErrors((list) => [...list, { name: owner.name, message: error instanceof Error ? error.message : String(error) }]);
        }
      }
      if (stop.current) {
        showToast("Đã dừng hiệu chỉnh, chưa có kết quả.");
        return;
      }
      const split = (pooling: "mean" | "maxview", part: "select" | "test") => records.filter((r) => r.pooling === pooling && r.split === part);
      const mean = calibrateThresholds(toSamples(split("mean", "select")), toSamples(split("mean", "test")), farMax);
      const max = calibrateThresholds(toSamples(split("maxview", "select")), toSamples(split("maxview", "test")), farMax);
      const summary: CalibrationSummary = {
        ...mean,
        products: new Set(records.map((r) => r.productId)).size,
        queriesPerProduct: perProduct,
        seed,
        maxview: { tau: max.tau, delta: max.delta, select: max.select, test: max.test },
        closedSet: { mean: closedSet(split("mean", "test")), maxview: closedSet(split("maxview", "test")) },
      };
      setCalibration({ summary, records, names: new Map(gallery.map((entry) => [entry.productId, entry.name])), finishedAt: Date.now() });
      showToast("Đã hiệu chỉnh xong. Xem kết quả rồi bấm Áp dụng.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Không hiệu chỉnh được.", { tone: "error" });
    } finally {
      setRunning(null);
    }
  }

  async function saveThresholds(tau: number, delta: number, summary: CalibrationSummary | null) {
    setSaving(true);
    try {
      const result = await saveThresholdsAction({ tau, delta, calibration: summary });
      showToast(result.message ?? (result.ok ? "Đã lưu." : "Không lưu được."), { tone: result.ok ? "success" : "error" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: IndexStatusRow) {
    if (!window.confirm(`Xoá chỉ mục của "${row.name}"? Khách sẽ không tìm được sản phẩm này bằng ảnh cho tới khi lập lại.`)) return;
    const result = await deleteImageIndexAction(row.productId);
    setFresh((map) => {
      const next = new Map(map);
      next.set(row.productId, []);
      return next;
    });
    showToast(result.message ?? "", { tone: result.ok ? "success" : "error" });
  }

  function downloadCsv(run: CalibrationRun) {
    const blob = new Blob(["﻿", recordsToCsv(run.records, run.names)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `hieu-chinh-tim-bang-anh-${IMAGE_SEARCH_MODEL.id}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const saved = settings.calibration;
  const elapsed = running ? Math.max(1, (Date.now() - running.startedAt) / 1000) : 0;

  return (
    <div className="space-y-10">
      {running && (
        <section className="space-y-3 rounded-2xl border border-brand/40 bg-surface p-4 sm:p-5" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <LoaderCircle className="size-4 animate-spin text-brand-strong" aria-hidden />
            <p className="min-w-0 flex-1 font-semibold">
              {running.kind === "index" ? "Đang lập chỉ mục" : "Đang hiệu chỉnh"}: {running.current}
            </p>
            {running.total > 0 && (
              <span className="text-sm text-muted tabular-nums">
                {running.done}/{running.total} sản phẩm
                {running.done > 0 && ` · còn khoảng ${Math.ceil(((elapsed / running.done) * (running.total - running.done)) / 60)} phút`}
              </span>
            )}
            <Button size="sm" variant="secondary" onClick={() => (stop.current = true)}>
              <Square className="size-3.5" aria-hidden />
              Dừng
            </Button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${running.total ? (running.done / running.total) * 100 : 0}%` }} />
          </div>
          {running.model && (
            <p className="text-sm text-muted">
              Tải mô hình AI lần đầu: {Math.round(running.model.loaded / 1048576)} / {Math.round((running.model.total || IMAGE_SEARCH_MODEL.megabytes * 1048576) / 1048576)} MB
            </p>
          )}
          {running.thumbnails.length > 0 && (
            <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
              {running.thumbnails.map((thumbnail, index) => (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh dựng ngay trong trình duyệt (data URL)
                <img key={index} src={thumbnail} alt="" width={72} height={72} className="aspect-square w-full rounded-md border border-line bg-white object-cover" />
              ))}
            </div>
          )}
        </section>
      )}
      {errors.length > 0 && (
        <Notice tone="error">
          <p className="font-medium">Có {errors.length} sản phẩm không chạy được:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((error) => (
              <li key={error.name}>
                {error.name}: {error.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <section className="space-y-4" aria-labelledby="index-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="index-heading" className="text-xl font-bold">
              1. Lập chỉ mục
            </h2>
            <p className="max-w-3xl text-sm text-muted">
              Với mỗi sản phẩm có mô hình 3D, trình duyệt dựng 12 ảnh quanh mô hình (cách nhau 30°, góc ngẩng 15°, nền trắng), trích đặc trưng từng ảnh rồi gửi
              12 vector lên máy chủ. Máy chủ gộp thành một vector đại diện. Robot biến hình có thêm một bộ cho dạng xe. Mất vài giây mỗi sản phẩm.
            </p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => runIndex(pending)} disabled={busy || pending.length === 0}>
                <Play className="size-4" aria-hidden />
                Lập {pending.length} sản phẩm chưa có hoặc đã cũ
              </Button>
              <Button variant="secondary" onClick={() => runIndex(withModel)} disabled={busy || withModel.length === 0}>
                Lập lại tất cả ({withModel.length})
              </Button>
            </div>
          )}
        </div>
        {table.length === 0 ? (
          <Empty>Chưa có sản phẩm nào.</Empty>
        ) : (
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col">Sản phẩm</th>
                  <th scope="col">Chỉ mục</th>
                  <th scope="col">Lập lúc</th>
                  {canEdit && <th scope="col">Thao tác</th>}
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const outdated = isOutdated(row);
                  const latest = row.forms.reduce((max, form) => Math.max(max, form.createdAt), 0);
                  return (
                    <tr key={row.productId}>
                      <td>
                        <Link href={`/admin/san-pham/${row.productId}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {row.status !== "published" && <span className={BADGE}>{row.status === "draft" ? "Nháp" : row.status}</span>}
                          {!row.modelUrl && <span className={BADGE}>Chưa có mô hình 3D</span>}
                        </div>
                      </td>
                      <td>
                        <FormList forms={row.forms} outdated={outdated} />
                      </td>
                      <td className="whitespace-nowrap text-muted">{latest ? formatDateTime(latest) : "—"}</td>
                      {canEdit && (
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {row.modelUrl && (
                              <Button size="sm" variant={row.forms.length === 0 || outdated ? "primary" : "secondary"} disabled={busy} onClick={() => runIndex([row])}>
                                {row.forms.length === 0 ? "Lập chỉ mục" : "Lập lại"}
                              </Button>
                            )}
                            {row.forms.length > 0 && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(row)} aria-label={`Xoá chỉ mục của ${row.name}`}>
                                <Trash2 className="size-4" aria-hidden />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="calibration-heading">
        <div className="space-y-1">
          <h2 id="calibration-heading" className="text-xl font-bold">
            2. Hiệu chỉnh ngưỡng từ chối
          </h2>
          <p className="max-w-3xl text-sm text-muted">
            Khách được trả kết quả khi s₁ ≥ τ (đủ giống) và s₁ − s₂ ≥ δ (không lưỡng lự). Hiệu chỉnh dựng ảnh thử cho mỗi sản phẩm với góc, nền, ánh sáng ngẫu
            nhiên rồi làm mờ, nén JPEG cho giống ảnh chụp. Mỗi ảnh được chấm hai lần: với thư viện đầy đủ (hàng có bán) và với thư viện đã bỏ chính sản phẩm đó
            (đóng vai hàng không bán). Một nửa số ảnh dùng để chọn τ, δ sao cho tỉ lệ chấp nhận nhầm không vượt mức cho phép; nửa còn lại chỉ để kiểm tra.
          </p>
        </div>

        <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Ngưỡng đang dùng</p>
            <p className="mt-1 text-lg font-bold tabular-nums">
              τ = {decimal(settings.tau)} · δ = {decimal(settings.delta, 4)}
            </p>
            <p className="text-sm text-muted">
              {settings.source === "calibrated" ? "Từ hiệu chỉnh" : settings.source === "manual" ? "Tự nhập" : "Mặc định, chưa hiệu chỉnh"}
              {settings.updatedAt ? ` · ${formatDateTime(settings.updatedAt)}` : ""}
            </p>
          </div>
          {saved && (
            <div className="sm:col-span-1 lg:col-span-3">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Kết quả hiệu chỉnh đã lưu (tập kiểm tra)</p>
              <p className="mt-1 text-sm">
                {saved.products} sản phẩm × {saved.queriesPerProduct} ảnh · trả đúng <b>{pct(saved.test.correctAccept)}</b> · trả sai {pct(saved.test.wrongAccept)} · từ chối oan{" "}
                {pct(saved.test.falseReject)} · chấp nhận nhầm <b>{pct(saved.test.falseAccept)}</b> (cho phép ≤ {pct(saved.farMax)})
                {saved.closedSet && ` · Recall@1 ${pct(saved.closedSet.mean.recall1)}`}
              </p>
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Ảnh thử mỗi sản phẩm</span>
              <select value={perProduct} onChange={(event) => setPerProduct(Number(event.target.value))} disabled={busy} className="h-10 rounded-lg border border-line bg-surface px-3">
                {[4, 8, 12, 16, 24].map((n) => (
                  <option key={n} value={n}>
                    {n} ảnh
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Chấp nhận nhầm tối đa</span>
              <select value={farMax} onChange={(event) => setFarMax(Number(event.target.value))} disabled={busy} className="h-10 rounded-lg border border-line bg-surface px-3">
                {[0.01, 0.05, 0.1, 0.2].map((n) => (
                  <option key={n} value={n}>
                    {pct(n)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">Hạt giống</span>
              <input
                type="number"
                min={0}
                max={999999}
                value={seed}
                disabled={busy}
                onChange={(event) => setSeed(Math.max(0, Math.min(999999, Math.floor(Number(event.target.value) || 0))))}
                className="h-10 w-28 rounded-lg border border-line bg-surface px-3 tabular-nums"
              />
            </label>
            <Button onClick={runCalibration} disabled={busy || indexed.length < 2}>
              <Play className="size-4" aria-hidden />
              Chạy hiệu chỉnh ({indexed.length} sản phẩm × {perProduct} ảnh)
            </Button>
          </div>
        )}

        {calibration && (
          <div className="space-y-4 rounded-2xl border border-line bg-raised/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                Kết quả vừa chạy ({calibration.summary.products} sản phẩm × {calibration.summary.queriesPerProduct} ảnh, hạt giống {calibration.summary.seed}, chấp nhận
                nhầm ≤ {pct(calibration.summary.farMax)})
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => downloadCsv(calibration)}>
                  <Download className="size-4" aria-hidden />
                  Tải số liệu (CSV)
                </Button>
                {canEdit && (
                  <Button size="sm" pending={saving} onClick={() => saveThresholds(calibration.summary.tau, calibration.summary.delta, calibration.summary)}>
                    Áp dụng τ = {decimal(calibration.summary.tau)}, δ = {decimal(calibration.summary.delta, 4)}
                  </Button>
                )}
              </div>
            </div>
            <RatesTable result={calibration.summary} maxview={calibration.summary.maxview} />
            {calibration.summary.closedSet && (
              <p className="text-sm">
                Tập đóng, trước khi áp ngưỡng (ảnh kiểm tra): gộp trung bình Recall@1 <b>{pct(calibration.summary.closedSet.mean.recall1)}</b>, Recall@5{" "}
                {pct(calibration.summary.closedSet.mean.recall5)}, MRR {decimal(calibration.summary.closedSet.mean.mrr)} · maxview Recall@1{" "}
                {pct(calibration.summary.closedSet.maxview.recall1)}, Recall@5 {pct(calibration.summary.closedSet.maxview.recall5)}, MRR{" "}
                {decimal(calibration.summary.closedSet.maxview.mrr)}
              </p>
            )}
            <ScoreHistogram records={calibration.records} tau={calibration.summary.tau} />
            <p className="text-xs text-muted">
              Ảnh thử là ảnh dựng lại từ chính mô hình 3D trong điều kiện khác thư viện, dễ hơn ảnh khách chụp thật. Hãy coi đây là cận trên; khi có ảnh chụp
              thật, đối chiếu thêm với nhật ký lượt tìm bên dưới.
            </p>
          </div>
        )}

        {canEdit && (
          // Đặt lại ô nhập mỗi khi ngưỡng đang dùng đổi (sau khi lưu, trang tải lại dữ liệu).
          <form
            key={`${settings.tau}|${settings.delta}`}
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const read = (name: string) => Number(String(data.get(name) ?? "").trim().replace(",", "."));
              void saveThresholds(read("tau"), read("delta"), null);
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="block font-medium">τ tự nhập</span>
              <input name="tau" inputMode="decimal" defaultValue={String(settings.tau)} required className="h-10 w-28 rounded-lg border border-line bg-surface px-3 tabular-nums" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block font-medium">δ tự nhập</span>
              <input name="delta" inputMode="decimal" defaultValue={String(settings.delta)} required className="h-10 w-28 rounded-lg border border-line bg-surface px-3 tabular-nums" />
            </label>
            <Button type="submit" variant="secondary" pending={saving} disabled={busy}>
              Lưu ngưỡng tự nhập
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
