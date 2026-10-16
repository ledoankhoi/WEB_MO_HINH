"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { mediaAction } from "@/app/actions/admin";
import { ProductImage } from "@/components/product/ProductCard";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";

type MediaItem = { id: string; url: string; alt: string };

const icon = "grid size-9 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg disabled:opacity-40";

// YC-SP-06: ảnh sản phẩm. Tải lên qua Route Handler /admin/api/anh (ảnh tới 5 MB vượt giới hạn Server Action).
export function MediaPanel({ productId, media, cover, canEdit }: { productId: string; media: MediaItem[]; cover: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  const run = (mediaId: string, change: Parameters<typeof mediaAction>[2]) =>
    startTransition(async () => setResult(await mediaAction(productId, mediaId, change)));

  const upload = (form: HTMLFormElement) =>
    startTransition(async () => {
      const data = new FormData(form);
      data.set("productId", productId);
      const response = await fetch("/admin/api/anh", { method: "POST", body: data });
      const body = (await response.json().catch(() => ({ ok: false, message: "Tải lên thất bại." }))) as { ok: boolean; message?: string };
      setResult(body.ok ? { ok: true, message: "Đã tải ảnh lên." } : { message: body.message ?? "Tải lên thất bại." });
      if (body.ok) {
        form.reset();
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {result.message && <Notice tone={result.ok ? "success" : "error"}>{result.message}</Notice>}
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            upload(event.currentTarget);
          }}
        >
          <div className="min-w-56 flex-1">
            <label htmlFor="media-file" className="mb-1.5 block text-sm font-medium">
              Ảnh (WebP, PNG, JPEG, tối đa 5 MB)
            </label>
            <input id="media-file" name="file" type="file" required accept="image/webp,image/png,image/jpeg" className="block w-full text-sm" />
          </div>
          <div className="min-w-56 flex-1">
            <Field label="Chữ thay thế (alt)" name="alt" maxLength={160} hint="Mô tả ngắn nội dung ảnh cho trình đọc màn hình." />
          </div>
          <Button type="submit" pending={pending}>
            Tải lên
          </Button>
        </form>
      )}

      {media.length === 0 ? (
        <p className="text-sm text-muted">Chưa có ảnh tải lên. {cover && "Ảnh đại diện hiện tại là ảnh chụp từ mô hình 3D."}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item, index) => (
            <li key={item.id} className="space-y-2 rounded-xl border border-line bg-surface p-3">
              <ProductImage src={item.url} alt={item.alt} className="aspect-square w-full rounded-lg bg-raised" />
              {item.url === cover && <p className="text-xs font-semibold text-brand-strong">Ảnh đại diện</p>}
              {canEdit && (
                <>
                  <input
                    aria-label="Chữ thay thế"
                    defaultValue={item.alt}
                    maxLength={160}
                    placeholder="Chữ thay thế"
                    onBlur={(event) => event.target.value !== item.alt && run(item.id, { alt: event.target.value })}
                    className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm focus:border-brand focus:outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" className={icon} aria-label="Lên trước" disabled={pending || index === 0} onClick={() => run(item.id, { move: -1 })}>
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button type="button" className={icon} aria-label="Xuống sau" disabled={pending || index === media.length - 1} onClick={() => run(item.id, { move: 1 })}>
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    {item.url !== cover && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(item.id, { cover: true })}>
                        Làm ảnh đại diện
                      </Button>
                    )}
                    <button
                      type="button"
                      className={`${icon} ml-auto hover:text-danger`}
                      aria-label="Xoá ảnh"
                      disabled={pending}
                      onClick={() => window.confirm("Xoá ảnh này?") && run(item.id, { remove: true })}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
