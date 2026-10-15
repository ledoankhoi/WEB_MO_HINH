import { ProductForm } from "@/components/admin/ProductForm";
import { requireAdmin } from "@/server/auth/session";

export default async function AdminNewProductPage() {
  await requireAdmin("/admin/san-pham/moi");
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Thêm sản phẩm</h1>
      <ProductForm />
    </>
  );
}
