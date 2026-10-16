import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InfoPageView } from "@/components/content/InfoPageView";
import { getPublishedPage } from "@/server/catalog";

type Props = PageProps<"/trang/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPublishedPage((await params).slug);
  return page ? { title: page.title, description: page.metaDescription || undefined } : { title: "Không tìm thấy trang" };
}

async function InfoPageContent({ params }: Pick<Props, "params">) {
  const page = await getPublishedPage((await params).slug);
  if (!page) notFound();
  return <InfoPageView page={page} />;
}

export default function InfoPage({ params }: Props) {
  return (
    <div className="px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="py-20 text-center text-sm text-muted">Đang tải...</p>}>
        <InfoPageContent params={params} />
      </Suspense>
    </div>
  );
}
