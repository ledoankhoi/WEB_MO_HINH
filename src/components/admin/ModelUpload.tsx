"use client";

import { useState, useTransition } from "react";
import { finishModelUploadAction, startModelUploadAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

const MAX_BYTES = 25 * 1024 * 1024;

// YC-SP-10, Q18: xin URL có chữ ký, trình duyệt gửi thẳng file lên Storage, rồi nhờ máy chủ kiểm tra và gắn.
export function ModelUpload({ productId, modelUrl }: { productId: string; modelUrl: string | null }) {
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const upload = (form: HTMLFormElement) =>
    startTransition(async () => {
      const file = new FormData(form).get("file");
      if (!(file instanceof File) || file.size === 0) return setResult({ message: "Chưa chọn file." });
      if (file.size > MAX_BYTES) return setResult({ message: "File lớn hơn 25 MB. Hãy nén mô hình trước khi tải." });
      const start = await startModelUploadAction(productId);
      if (!start.ok) return setResult({ message: start.message });
      const response = await fetch(start.uploadUrl, { method: "PUT", headers: { "Content-Type": "model/gltf-binary" }, body: file }).catch(() => null);
      if (!response?.ok) return setResult({ message: "Gửi file lên kho media thất bại. Vui lòng thử lại." });
      const finished = await finishModelUploadAction(productId, start.path);
      setResult(finished);
      if (finished.ok) form.reset();
    });

  return (
    <section aria-labelledby="mo-hinh-3d" className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <h2 id="mo-hinh-3d" className="text-lg font-semibold">
        Mô hình 3D (.glb)
      </h2>
      <p className="text-sm text-muted">
        Hiện tại: {modelUrl ? <span className="break-all">{modelUrl}</span> : "chưa có file, cửa hàng dùng mô hình dựng sẵn theo kiểu dáng."}
      </p>
      <Notice tone="info">
        File phải nén sẵn (meshopt, texture WebP; xem <code>npm run media</code>), tối đa 25 MB. Mô hình giấy phép CC BY phải có mục trong{" "}
        <code>src/data/model-credits.json</code> để hiện tác giả dưới khung 3D.
      </Notice>
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          upload(event.currentTarget);
        }}
      >
        <div className="min-w-56 flex-1">
          <label htmlFor="model-file" className="mb-1.5 block text-sm font-medium">
            File .glb
          </label>
          <input id="model-file" name="file" type="file" required accept=".glb,model/gltf-binary" className="block w-full text-sm" />
        </div>
        <Button type="submit" pending={pending}>
          Tải mô hình
        </Button>
      </form>
    </section>
  );
}
