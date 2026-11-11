"use client";

import { useActionState, useState, useTransition } from "react";
import { newsAction, saveNewsAction } from "@/app/actions/news";
import { UploadInto } from "@/components/admin/BannerForms";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { FormState } from "@/lib/types";
import type { NewsPost } from "@/server/repo/news";

const INITIAL: FormState = {};

export function NewsForm({ post }: { post?: NewsPost }) {
  const [state, action, pending] = useActionState(saveNewsAction, INITIAL);
  const values = state.ok && !post ? {} : (state.values ?? {});
  const value = (key: string, fallback: string) => values[key] ?? fallback;
  const [coverImage, setCoverImage] = useState(value("coverImage", post?.coverImage ?? ""));
  const errors = state.errors ?? {};
  return (
    <form action={action} key={state.ok && !post ? state.message : "form"} className="space-y-4 rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{post ? `Sửa bài ${post.title}` : "Viết bài mới"}</h2>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      {post && <input type="hidden" name="id" value={post.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tiêu đề" name="title" required maxLength={160} defaultValue={value("title", post?.title ?? "")} error={errors.title} />
        <Field label="Đường dẫn (slug)" name="slug" maxLength={80} defaultValue={value("slug", post?.slug ?? "")} error={errors.slug} hint="Bài hiện ở /tin-tuc/<slug>. Để trống thì tạo từ tiêu đề." />
        <div className="sm:col-span-2">
          <TextAreaField label="Tóm tắt" name="summary" rows={2} maxLength={300} defaultValue={value("summary", post?.summary ?? "")} error={errors.summary} hint="Hiện ở danh sách tin và làm mô tả SEO." />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Field label="Ảnh bìa (không bắt buộc)" name="coverImage" value={coverImage} onChange={(event) => setCoverImage(event.target.value)} error={errors.coverImage} />
          <UploadInto target="ảnh bìa" onDone={setCoverImage} />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField label="Nội dung" name="body" rows={16} maxLength={30000} defaultValue={value("body", post?.body ?? "")} error={errors.body} hint="Văn bản thuần, xuống dòng được giữ nguyên. Không dùng HTML." />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" pending={pending}>
          {post ? "Lưu" : "Tạo bản nháp"}
        </Button>
        {post && (
          <ButtonLink href="/admin/noi-dung/tin-tuc" variant="secondary">
            Đóng
          </ButtonLink>
        )}
      </div>
    </form>
  );
}

export function NewsButtons({ id, status }: { id: string; status: "draft" | "published" }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<FormState>({});
  const run = (action: "publish" | "unpublish" | "delete") => startTransition(async () => setResult(await newsAction(id, action)));
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={status === "draft" ? "primary" : "secondary"} disabled={pending} onClick={() => run(status === "draft" ? "publish" : "unpublish")}>
          {status === "draft" ? "Xuất bản" : "Gỡ xuống"}
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => window.confirm("Xoá bài viết này? Không khôi phục được.") && run("delete")}>
          Xoá
        </Button>
      </div>
      {result.message && <Notice tone="error">{result.message}</Notice>}
    </div>
  );
}
