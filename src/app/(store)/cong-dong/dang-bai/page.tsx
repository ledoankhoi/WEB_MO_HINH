import { Suspense } from "react";
import type { Metadata } from "next";
import { NewPostForm } from "@/components/community/NewPostForm";
import { requireUser } from "@/server/auth/session";
import { searchProducts } from "@/server/catalog";

export const metadata: Metadata = { title: "Đăng bài cộng đồng", robots: { index: false } };

async function Form() {
  await requireUser("/cong-dong/dang-bai");
  const { items } = await searchProducts({ q: "", category: "", sort: "ten", page: 1, pageSize: 200 });
  return <NewPostForm products={items.map(({ slug, name }) => ({ slug, name }))} />;
}

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-16 sm:px-6 lg:pt-10">
      <h1 className="font-condensed text-[clamp(2.5rem,6vw,4rem)] leading-none font-black uppercase italic">Đăng bài</h1>
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang mở trình soạn bài...</p>}>
        <Form />
      </Suspense>
    </div>
  );
}
