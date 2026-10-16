"use client";

import { useActionState, useState, useTransition } from "react";
import { bannerAction, saveBannerAction } from "@/app/actions/content";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { toVnDateTimeInput } from "@/lib/format";
import type { FormState } from "@/lib/types";
import type { Banner } from "@/server/repo/content";

const INITIAL: FormState = {};

// Tải ảnh lên kho media qua /admin/api/anh rồi điền đường dẫn vào ô ảnh.
function UploadInto({ target, onDone }: { target: string; onDone: (url: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="file"
        accept="image/webp,image/png,image/jpeg"
        aria-label={`Tải ${target}`}
        disabled={pending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          startTransition(async () => {
            const data = new FormData();
            data.set("target", "banner");
            data.set("file", file);
            const response = await fetch("/admin/api/anh", { method: "POST", body: data });
            const body = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; url?: string; message?: string };
            if (body.ok && body.url) {
              onDone(body.url);
              setMessage("Đã tải lên.");
            } else setMessage(body.message ?? "Tải lên thất bại.");
          });
        }}
      />
      {message && <span className="text-muted">{message}</span>}
    </div>
  );
}

export function BannerForm({ banner }: { banner?: Banner }) {
  const [state, action, pending] = useActionState(saveBannerAction, INITIAL);
  const values = state.ok && !banner ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  const [imageUrl, setImageUrl] = useState(value("imageUrl", banner?.imageUrl ?? ""));
  const [imageMobileUrl, setImageMobileUrl] = useState(value("imageMobileUrl", banner?.imageMobileUrl ?? ""));
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok && !banner ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{banner ? `Sửa banner ${banner.title}` : "Thêm banner"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tiêu đề" name="title" required maxLength={120} defaultValue={value("title", banner?.title ?? "")} error={errors.title} />
        <Field label="Liên kết đích" name="linkUrl" maxLength={300} placeholder="/san-pham?loai=transformers" defaultValue={value("linkUrl", banner?.linkUrl ?? "")} error={errors.linkUrl} hint="Nội bộ bắt đầu bằng /, bên ngoài phải là https://." />
        <div className="sm:col-span-2">
          <TextAreaField label="Phụ đề" name="subtitle" rows={2} maxLength={200} defaultValue={value("subtitle", banner?.subtitle ?? "")} error={errors.subtitle} />
        </div>
        <div className="space-y-2">
          <Field label="Ảnh máy tính" name="imageUrl" required value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} error={errors.imageUrl} />
          <UploadInto target="ảnh máy tính" onDone={setImageUrl} />
        </div>
        <div className="space-y-2">
          <Field label="Ảnh điện thoại (không bắt buộc)" name="imageMobileUrl" value={imageMobileUrl} onChange={(e) => setImageMobileUrl(e.target.value)} error={errors.imageMobileUrl} />
          <UploadInto target="ảnh điện thoại" onDone={setImageMobileUrl} />
        </div>
        <SelectField label="Vị trí" name="placement" defaultValue={value("placement", banner?.placement ?? "home_hero")} error={errors.placement}>
          <option value="home_hero">Trang chủ, khung lớn trên cùng</option>
          <option value="home_strip">Trang chủ, dải banner nhỏ</option>
        </SelectField>
        <Field label="Thứ tự" name="sortOrder" type="number" min={0} max={999} defaultValue={value("sortOrder", String(banner?.sortOrder ?? 0))} error={errors.sortOrder} />
        <Field label="Bắt đầu (giờ Việt Nam)" name="startsAt" type="datetime-local" defaultValue={value("startsAt", banner?.startsAt ? toVnDateTimeInput(banner.startsAt) : "")} error={errors.startsAt} hint="Để trống là hiện ngay khi xuất bản." />
        <Field label="Kết thúc (giờ Việt Nam)" name="endsAt" type="datetime-local" defaultValue={value("endsAt", banner?.endsAt ? toVnDateTimeInput(banner.endsAt) : "")} error={errors.endsAt} hint="Hết giờ thì tự ẩn (trễ tối đa vài phút)." />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {banner ? "Lưu banner" : "Thêm banner"}
        </Button>
        {banner && (
          <ButtonLink href="/admin/noi-dung/banner" variant="secondary">
            Huỷ sửa
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function BannerButtons({ id, status }: { id: string; status: "draft" | "published" }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (action: "publish" | "unpublish" | "delete") => startTransition(async () => setResult(await bannerAction(id, action)));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={status === "draft" ? "primary" : "secondary"} disabled={pending} onClick={() => run(status === "draft" ? "publish" : "unpublish")}>
          {status === "draft" ? "Xuất bản" : "Gỡ xuống"}
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => window.confirm("Xoá banner này?") && run("delete")}>
          Xoá
        </Button>
      </div>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}
