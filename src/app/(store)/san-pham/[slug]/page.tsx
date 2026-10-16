import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/product/ProductView";
import { getModelFeatures } from "@/lib/model-features";
import { getProductBySlug, getProductSlugs, getRelatedProducts } from "@/server/catalog";

type Props = PageProps<"/san-pham/[slug]">;

export async function generateStaticParams() {
  return (await getProductSlugs()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: "Không tìm thấy sản phẩm" };
  return {
    title: product.name,
    description: product.tagline,
    openGraph: { title: product.name, description: product.tagline, images: product.image ? [product.image] : undefined },
  };
}

async function ProductDetail({ params }: Pick<Props, "params">) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const features = getModelFeatures(product.modelUrl);
  // Bộ hợp thể: dạng ghép liệt kê các thành viên, thành viên trỏ về dạng ghép.
  const linkedSlugs = features?.members ?? (features?.combinesInto ? [features.combinesInto] : []);
  const linked = (await Promise.all(linkedSlugs.map((slug) => getProductBySlug(slug)))).filter((item) => item !== null);
  const related = await getRelatedProducts(product.category, product.id, 4);
  return <ProductView product={product} linked={linked} related={related} />;
}

export default function ProductPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="py-32 text-center text-sm text-muted">Đang tải sản phẩm...</p>}>
        <ProductDetail params={params} />
      </Suspense>
    </div>
  );
}
