import { TaxonomyPage } from "@/components/admin/TaxonomyPage";

export default function AdminCategoriesPage({ searchParams }: PageProps<"/admin/danh-muc">) {
  return <TaxonomyPage kind="categories" searchParams={searchParams} />;
}
