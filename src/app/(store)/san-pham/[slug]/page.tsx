import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid, ProductImage } from "@/components/product/ProductCard";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import { getCategory } from "@/lib/catalog";
import { formatVnd } from "@/lib/format";
import { getModelFeatures, modelKey } from "@/lib/model-features";
import { getProductBySlug, getProductSlugs, getRelatedProducts } from "@/server/catalog";
import modelCredits from "@/data/model-credits.json";

type ModelCredit = { title: string; author: string; authorUrl: string; license: string; licenseUrl: string; sourceUrl: string };
const credits: Record<string, ModelCredit | undefined> = modelCredits;

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
  const credit = credits[modelKey(product.modelUrl) ?? ""];
  const features = getModelFeatures(product.modelUrl);
  // Bộ hợp thể: dạng ghép liệt kê các thành viên, thành viên trỏ về dạng ghép.
  const linkedSlugs = features?.members ?? (features?.combinesInto ? [features.combinesInto] : []);
  const linked = (await Promise.all(linkedSlugs.map((slug) => getProductBySlug(slug)))).filter((item) => item !== null);
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
              features={features}
              label={`Mô hình 3D của ${product.name}`}
            />
          </div>
          <p className="text-xs text-muted">
            Mô hình 3D tương tác: kéo để xoay, giữ Ctrl và cuộn để phóng to.
            {features?.transform &&
              (features.transform.kind === "combine"
                ? " Bấm Hợp thể để xem các thành viên ghép lại."
                : " Bấm nút đổi dạng để chuyển giữa dạng xe và dạng robot.")}
          </p>
          {credit && (
            <p className="text-xs text-muted">
              Mô hình 3D:{" "}
              <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.title}
              </a>{" "}
              của{" "}
              <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.author}
              </a>
              , giấy phép{" "}
              <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.license}
              </a>
              .
            </p>
          )}
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

          {linked.length > 0 && (
            <section aria-labelledby="hop-the" className="border-t border-line pt-6">
              <h2 id="hop-the" className="mb-3 text-lg font-semibold">
                {features?.members ? "Các thành viên hợp thể" : "Hợp thể thành"}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {linked.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/san-pham/${item.slug}`}
                      className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-4 pl-1 text-sm font-medium transition hover:border-brand hover:text-brand"
                    >
                      <ProductImage src={item.image} alt="" className="product-stage size-10 rounded-full" />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
