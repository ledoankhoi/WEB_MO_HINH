import { TaxonomyPage } from "@/components/admin/TaxonomyPage";

export default function AdminBrandsPage({ searchParams }: PageProps<"/admin/thuong-hieu">) {
  return <TaxonomyPage kind="brands" searchParams={searchParams} />;
}
