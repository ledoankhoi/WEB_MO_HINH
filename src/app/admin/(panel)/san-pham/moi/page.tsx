import { ProductForm } from "@/components/admin/ProductForm";
import { requireStaff } from "@/server/auth/session";

export default async function AdminNewProductPage() {
  await requireStaff("catalog.edit", "/admin/san-pham/moi");
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Thêm sản phẩm</h1>
      <ProductForm />
    </>
  );
}
