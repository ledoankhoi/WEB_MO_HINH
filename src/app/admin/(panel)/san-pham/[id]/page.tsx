import Link from "next/link";
import { notFound } from "next/navigation";
import { first, isId } from "@/components/admin/parts";
import { ProductForm } from "@/components/admin/ProductForm";
import { VariantsPanel } from "@/components/admin/VariantsPanel";
import { ProductView } from "@/components/product/ProductView";
import { Notice } from "@/components/ui/Notice";
import { site } from "@/config/site";
import { formatDateTime, formatVnd } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requireStaff } from "@/server/auth/session";
import { findProductById, listPriceHistory } from "@/server/repo/products";
import { productFormOptions } from "@/server/repo/taxonomy";

// YC-SP-04: màn hình sản phẩm chia tab. Media (T07) và SEO (T21) thêm sau.
const TABS = { "thong-tin": "Thông tin", "bien-the": "Biến thể", "xem-truoc": "Xem trước" } as const;
type Tab = keyof typeof TABS;

const money = (value: unknown) => (typeof value === "number" ? formatVnd(value) : "—");

export default async function AdminEditProductPage({ params, searchParams }: PageProps<"/admin/san-pham/[id]">) {
  const { id } = await params;
  const user = await requireStaff("catalog.view", `/admin/san-pham/${id}`);
  const product = isId(id) ? await findProductById(id) : null;
  if (!product) notFound();
  const query = await searchParams;
  const tab: Tab = first(query.tab) in TABS ? (first(query.tab) as Tab) : "thong-tin";
  const canEdit = can(user.role, "catalog.edit");

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{product.name}</h1>
        {product.isActive && (
          <a href={`${site.url}/san-pham/${product.slug}`} className="text-sm font-medium text-brand-strong hover:underline">
            Xem trên cửa hàng
          </a>
        )}
      </div>
      {first(query.moi) && <Notice tone="success">Đã tạo sản phẩm.</Notice>}

      <nav aria-label="Phần của sản phẩm" className="flex gap-1 border-b border-line">
        {(Object.entries(TABS) as [Tab, string][]).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/san-pham/${product.id}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "thong-tin" && <ProductForm product={product} options={await productFormOptions()} />}

      {tab === "bien-the" && (
        <>
          <VariantsPanel productId={product.id} variants={product.variants} editingId={first(query["bien-the"])} canEdit={canEdit} />
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Lịch sử giá</h2>
            <ul className="space-y-1 text-sm">
              {(await listPriceHistory(product.id)).map((change, index) => (
                <li key={index}>
                  <span className="text-muted tabular-nums">{formatDateTime(change.at)}</span> · {change.summary}: {money(change.before.price)} → {money(change.after.price)}
                  {"compareAtPrice" in change.after && ` (giá gốc ${money(change.before.compareAtPrice)} → ${money(change.after.compareAtPrice)})`}
                  <span className="text-muted"> · {change.actorName ?? "Hệ thống"}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {tab === "xem-truoc" && (
        <div className="space-y-6 rounded-2xl border border-dashed border-line p-4 sm:p-6">
          <Notice tone="info">Bản xem trước theo dữ liệu đang lưu (kể cả khi chưa xuất bản). Khách chỉ thấy trang này khi sản phẩm ở trạng thái Xuất bản.</Notice>
          <ProductView product={product} preview />
        </div>
      )}
    </>
  );
}
