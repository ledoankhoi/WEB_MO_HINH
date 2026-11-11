import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkshopStudio } from "@/components/product/WorkshopStudio";
import { site } from "@/config/site";
import { getModelFeatures } from "@/lib/model-features";
import { orderableQty } from "@/lib/preorder";
import { hasWorkshop } from "@/lib/workshop";
import { getProductBySlug } from "@/server/catalog";

type Props = PageProps<"/san-pham/[slug]/xuong">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProductBySlug((await params).slug);
  if (!product || !hasWorkshop(product.category)) return { title: "Không tìm thấy sản phẩm" };
  return {
    title: `Xưởng tuỳ biến: ${product.name}`,
    description: `Sơn lại, thêm đế trưng bày, đèn LED, decal tên riêng, hộp quà cho ${product.name}; xem trước trên mô hình 3D.`,
    alternates: { canonical: `/san-pham/${product.slug}/xuong` },
  };
}

// Xưởng ROBOTICA (trang riêng, tách khỏi trang chi tiết sản phẩm): tuỳ biến làm theo đơn, xem trước trên mô hình 3D.
async function Studio({ params }: Pick<Props, "params">) {
  const product = await getProductBySlug((await params).slug);
  if (!product || !hasWorkshop(product.category)) notFound();
  const variants = product.variants.filter((variant) => variant.isActive);
  const variant = variants.find((item) => item.isDefault) ?? variants[0];
  if (!variant) notFound();
  const features = getModelFeatures(product.modelUrl);
  const parts = product.boxContents
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    <WorkshopStudio
      slug={product.slug}
      variantId={variant.id}
      name={product.name}
      price={variant.price}
      stock={orderableQty(variant.stock, variant.preorder ?? null, site.maxQtyPerItem)}
      category={product.category}
      parts={parts}
      viewer={{ model: product.model, colors: product.colors, modelUrl: product.modelUrl, features, label: `Xưởng: mô hình 3D của ${product.name}` }}
    />
  );
}

export default function WorkshopPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="py-32 text-center text-sm text-muted">Đang mở Xưởng...</p>}>
        <Studio params={params} />
      </Suspense>
    </div>
  );
}
