import { TaxonomyPage } from "@/components/admin/TaxonomyPage";
import { AdminSuspense } from "@/components/admin/AdminSuspense";

export default function AdminSeriesPage({ searchParams }: PageProps<"/admin/series">) {
  return (
    <AdminSuspense>
      <TaxonomyPage kind="series" searchParams={searchParams} />
    </AdminSuspense>
  );
}
