import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/product/ProductView";
import { getModelFeatures } from "@/lib/model-features";
import { jsonLdScript, productJsonLd } from "@/lib/structured-data";
import { site } from "@/config/site";
import { getProductBySlug, getProductDeals, getProductMedia, getProductQuestions, getProductReviews, getProductSlugs, getRelatedProducts } from "@/server/catalog";

type Props = PageProps<"/san-pham/[slug]">;

export async function generateStaticParams() {
  return (await getProductSlugs()).map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product) return { title: "Không tìm thấy sản phẩm" };
  const title = product.metaTitle || product.name;
  const description = product.metaDescription || product.tagline;
  return {
    title,
    description,
    alternates: { canonical: `/san-pham/${product.slug}` },
    openGraph: { title, description, images: product.image ? [{ url: product.image, alt: product.name }] : undefined },
  };
}

async function ProductDetail({ params }: Pick<Props, "params">) {
  const product = await getProductBySlug((await params).slug);
  if (!product) notFound();
  const features = getModelFeatures(product.modelUrl);
  // Bộ hợp thể: dạng ghép liệt kê các thành viên, thành viên trỏ về dạng ghép.
  const linkedSlugs = features?.members ?? (features?.combinesInto ? [features.combinesInto] : []);
  const linked = (await Promise.all(linkedSlugs.map((slug) => getProductBySlug(slug)))).filter((item) => item !== null);
  const [related, reviews, media, questions, deals] = await Promise.all([
    getRelatedProducts(product.category, product.id, 4),
    getProductReviews(product.id),
    getProductMedia(product.id),
    getProductQuestions(product.id),
    getProductDeals(product.id),
  ]);
  return (
    <>
      {/* Dữ liệu cấu trúc Product (mục 20). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(productJsonLd(product, reviews, site.url)) }} />
      <ProductView product={product} linked={linked} related={related} reviews={reviews} media={media} questions={questions} deals={deals} />
    </>
  );
}

export default function ProductPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="py-32 text-center text-sm text-muted">Đang tải sản phẩm...</p>}>
        <ProductDetail params={params} />
      </Suspense>
    </div>
  );
}
