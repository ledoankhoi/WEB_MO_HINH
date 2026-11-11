import { TaxonomyPage } from "@/components/admin/TaxonomyPage";
import { AdminSuspense } from "@/components/admin/AdminSuspense";

export default function AdminBrandsPage({ searchParams }: PageProps<"/admin/thuong-hieu">) {
  return (
    <AdminSuspense>
      <TaxonomyPage kind="brands" searchParams={searchParams} />
    </AdminSuspense>
  );
}
