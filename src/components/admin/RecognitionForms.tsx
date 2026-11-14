"use client";

import { useActionState, useState, useTransition } from "react";
import {
  activateModelAction,
  applySuggestionsAction,
  deleteModelAction,
  importModelAction,
  importRobotsAction,
  linkProductAction,
} from "@/app/actions/recognition";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

// Trang quản trị /admin/nhan-dien (B10): nhập dữ liệu của bước học máy, bật mô hình, ghép robot với sản phẩm.
const INITIAL: FormState = {};
const FILE_INPUT = "block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-sm file:font-medium";

function FileField({ label, name, hint, error }: { label: string; name: string; hint: string; error?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input type="file" name={name} accept="application/json,.json" required className={FILE_INPUT} />
      <span className={error ? "block text-xs text-danger" : "block text-xs text-muted"}>{error ?? hint}</span>
    </label>
  );
}

export function RobotsImportForm() {
  const [state, action, pending] = useActionState(importRobotsAction, INITIAL);
  return (
    <form action={action} key={state.ok ? state.message : "robots"} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">Nhập danh sách robot</h3>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <FileField label="robots.json" name="file" error={state.errors?.file}
                 hint="Do bước B1 sinh (ml/data/manifests/robots.json). Robot đã có được cập nhật theo slug, không robot nào bị xoá." />
      <Button type="submit" pending={pending}>Nhập robot</Button>
    </form>
  );
}

export function ModelImportForm() {
  const [state, action, pending] = useActionState(importModelAction, INITIAL);
  return (
    <form action={action} key={state.ok ? state.message : "model"} className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h3 className="font-semibold">Nhập mô hình</h3>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <FileField label="model-card.json" name="card" error={state.errors?.card}
                 hint="Do bước B9 sinh. File .onnx phải có sẵn trên kho media ở ml/<mã mô hình>/." />
      <FileField label="labels.json" name="labels" error={state.errors?.labels} hint="Nhãn của từng lớp, cùng thư mục với model card." />
      <Button type="submit" pending={pending}>Nhập mô hình</Button>
    </form>
  );
}

function useRun() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (fn: () => Promise<FormState>) => startTransition(async () => setResult(await fn()));
  return { pending, result, run };
}

export function ModelButtons({ id, active }: { id: string; active: boolean }) {
  const { pending, result, run } = useRun();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {active ? (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => window.confirm("Tắt nhận dạng robot? Khách sẽ không dùng được trang nhận dạng.") && run(() => activateModelAction(""))}>
            Tắt
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={pending} onClick={() => run(() => activateModelAction(id))}>Bật</Button>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => window.confirm(`Xoá mô hình ${id}? Nhật ký lượt nhận dạng vẫn giữ.`) && run(() => deleteModelAction(id))}>
              Xoá
            </Button>
          </>
        )}
      </div>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}

export function SuggestionsButton() {
  const { pending, result, run } = useRun();
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={pending} onClick={() => run(applySuggestionsAction)}>Ghép theo gợi ý của B1</Button>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
    </div>
  );
}

export function RobotProducts({ robotId, linked, choices }: { robotId: string; linked: { id: string; name: string }[]; choices: { id: string; name: string }[] }) {
  const { pending, result, run } = useRun();
  const [productId, setProductId] = useState("");
  const free = choices.filter((c) => !linked.some((l) => l.id === c.id));
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-1.5">
        {linked.map((p) => (
          <li key={p.id} className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs">
            {p.name}
            <button type="button" aria-label={`Gỡ ${p.name}`} disabled={pending} className="text-muted hover:text-danger" onClick={() => run(() => linkProductAction(robotId, p.id, false))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Chọn sản phẩm để ghép" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs">
          <option value="">Ghép thêm sản phẩm…</option>
          {free.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" disabled={pending || !productId} onClick={() => run(async () => { const r = await linkProductAction(robotId, productId, true); setProductId(""); return r; })}>
          Ghép
        </Button>
      </div>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}
