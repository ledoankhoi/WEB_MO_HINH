import { TaxonomyPage } from "@/components/admin/TaxonomyPage";
import { AdminSuspense } from "@/components/admin/AdminSuspense";

export default function AdminCategoriesPage({ searchParams }: PageProps<"/admin/danh-muc">) {
  return (
    <AdminSuspense>
      <TaxonomyPage kind="categories" searchParams={searchParams} />
    </AdminSuspense>
  );
}
