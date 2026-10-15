import Link from "next/link";
import { notFound } from "next/navigation";
import { first, isId } from "@/components/admin/parts";
import { ProductForm } from "@/components/admin/ProductForm";
import { Notice } from "@/components/ui/Notice";
import { requireStaff } from "@/server/auth/session";
import { findProductById } from "@/server/repo/products";

export default async function AdminEditProductPage({ params, searchParams }: PageProps<"/admin/san-pham/[id]">) {
  const { id } = await params;
  await requireStaff("catalog.view", `/admin/san-pham/${id}`);
  const product = isId(id) ? await findProductById(id) : null;
  if (!product) notFound();

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
        {product.isActive && (
          <Link href={`/san-pham/${product.slug}`} className="text-sm font-medium text-brand-strong hover:underline">
            Xem trên cửa hàng
          </Link>
        )}
      </div>
      {first((await searchParams).moi) && <Notice tone="success">Đã tạo sản phẩm.</Notice>}
      <ProductForm product={product} />
    </>
  );
}
