import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/product/ProductCard";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
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
  const category = getCategory(product.category);
  const related = await getRelatedProducts(product.category, product.id, 4);
  const status = product.stock <= 0 ? "Hết hàng" : product.stock <= 3 ? `Sắp hết hàng (còn ${product.stock})` : "Còn hàng";

  return (
    <>
      <nav aria-label="Đường dẫn" className="text-sm text-muted">
        <Link href="/san-pham" className="hover:text-fg">
          Cửa hàng
        </Link>
        {category && (
          <>
            {" / "}
            <Link href={`/san-pham?loai=${category.slug}`} className="hover:text-fg">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="space-y-2">
          <div className="product-stage h-[380px] overflow-hidden rounded-2xl border border-line sm:h-[520px] lg:sticky lg:top-24">
            <RobotViewerLoader
              model={product.model}
              colors={product.colors}
              modelUrl={product.modelUrl}
              label={`Mô hình 3D của ${product.name}`}
            />
          </div>
          <p className="text-xs text-muted">Mô hình 3D tương tác: kéo để xoay, giữ Ctrl và cuộn để phóng to.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            {category && <p className="text-xs font-semibold tracking-wide text-brand-strong uppercase">{category.name}</p>}
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
            <p className="text-muted">{product.tagline}</p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-3xl font-bold tabular-nums">{formatVnd(product.price)}</p>
            <p className={`text-sm font-medium ${product.stock > 0 ? "text-success" : "text-danger"}`}>{status}</p>
          </div>
          <PurchasePanel id={product.id} name={product.name} stock={product.stock} />

          <section aria-labelledby="mo-ta" className="border-t border-line pt-6">
            <h2 id="mo-ta" className="mb-3 text-lg font-semibold">
              Chi tiết sản phẩm
            </h2>
            <div className="prose-store text-sm leading-relaxed whitespace-pre-line text-muted">{product.description}</div>
          </section>

          {product.specs.length > 0 && (
            <section aria-labelledby="thong-so" className="border-t border-line pt-6">
              <h2 id="thong-so" className="mb-3 text-lg font-semibold">
                Thông số
              </h2>
              <dl className="divide-y divide-line text-sm">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="grid grid-cols-[9rem_1fr] gap-3 py-2.5">
                    <dt className="text-muted">{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="lien-quan" className="pt-6">
          <h2 id="lien-quan" className="mb-6 text-2xl font-semibold tracking-tight">
            Sản phẩm liên quan
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
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
