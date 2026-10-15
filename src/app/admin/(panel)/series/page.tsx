import { TaxonomyPage } from "@/components/admin/TaxonomyPage";

export default function AdminSeriesPage({ searchParams }: PageProps<"/admin/series">) {
  return <TaxonomyPage kind="series" searchParams={searchParams} />;
}
