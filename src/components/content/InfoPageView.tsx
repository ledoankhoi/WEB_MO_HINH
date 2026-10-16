import type { InfoPage } from "@/server/repo/content";

// Trang thông tin (YC-CMS-04). Nội dung là văn bản thuần, giữ xuống dòng; thẻ HTML (nếu có) hiện như chữ (Q19).
export function InfoPageView({ page }: { page: Pick<InfoPage, "title" | "body"> }) {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{page.title}</h1>
      <div className="text-base leading-relaxed whitespace-pre-line text-muted">{page.body}</div>
    </article>
  );
}
