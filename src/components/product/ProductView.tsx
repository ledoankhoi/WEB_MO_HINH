import Link from "next/link";
import { ProductGrid, ProductImage } from "@/components/product/ProductCard";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import RobotViewerLoader from "@/components/three/RobotViewerLoader";
import { getCategory } from "@/lib/catalog";
import { getModelFeatures, modelKey } from "@/lib/model-features";
import { formatDate, formatVnd } from "@/lib/format";
import type { Product, ProductSummary } from "@/lib/types";
import modelCredits from "@/data/model-credits.json";

type ModelCredit = { title: string; author: string; authorUrl: string; license: string; licenseUrl: string; sourceUrl: string };
const credits: Record<string, ModelCredit | undefined> = modelCredits;

// Thân trang sản phẩm. Trang cửa hàng và tab "Xem trước" của quản trị (YC-SP-08) dùng chung để bản xem
// trước giống hệt trang thật; `preview` thì không cho thêm vào giỏ.
export function ProductView({
  product,
  linked = [],
  related = [],
  reviews,
  preview = false,
}: {
  product: Product;
  linked?: Product[];
  related?: ProductSummary[];
  // Đánh giá đã duyệt (YC-DG-02); bản xem trước của quản trị không truyền.
  reviews?: { average: number; count: number; items: { id: string; userName: string; rating: number; comment: string; createdAt: number }[] };
  preview?: boolean;
}) {
  const category = getCategory(product.category);
  const credit = credits[modelKey(product.modelUrl) ?? ""];
  const features = getModelFeatures(product.modelUrl);
  const status = product.stock <= 0 ? "Hết hàng" : product.stock <= 3 ? `Sắp hết hàng (còn ${product.stock})` : "Còn hàng";

  return (
    <>
      <nav aria-label="Đường dẫn" className="text-sm text-muted">
        <Link href="/san-pham" className="hover:text-fg">
          Cửa hàng
        </Link>
        {category && (
          <>
            {" / "}
            <Link href={`/san-pham?loai=${category.slug}`} className="hover:text-fg">
              {category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
        <div className="space-y-2 lg:sticky lg:top-24 lg:self-start">
          <div className="product-stage h-[380px] overflow-hidden rounded-2xl border border-line sm:h-[520px]">
            <RobotViewerLoader
              model={product.model}
              colors={product.colors}
              modelUrl={product.modelUrl}
              features={features}
              label={`Mô hình 3D của ${product.name}`}
            />
          </div>
          <p className="text-xs text-muted">
            Mô hình 3D tương tác: kéo để xoay, giữ Ctrl và cuộn để phóng to.
            {features?.transform &&
              (features.transform.kind === "combine"
                ? " Bấm Hợp thể để xem các thành viên ghép lại."
                : " Bấm nút đổi dạng để chuyển giữa dạng xe và dạng robot.")}
          </p>
          {credit && (
            <p className="text-xs text-muted">
              Mô hình 3D:{" "}
              <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.title}
              </a>{" "}
              của{" "}
              <a href={credit.authorUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.author}
              </a>
              , giấy phép{" "}
              <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                {credit.license}
              </a>
              .
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            {category && <p className="text-xs font-semibold tracking-wide text-brand-strong uppercase">{category.name}</p>}
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
            <p className="text-muted">{product.tagline}</p>
            {reviews && reviews.count > 0 && (
              <a href="#danh-gia" className="inline-block text-sm text-muted hover:text-fg">
                <span aria-hidden="true" className="text-warning">★</span> {reviews.average.toLocaleString("vi-VN")}/5 · {reviews.count} đánh giá
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-3xl font-bold tabular-nums">{formatVnd(product.price)}</p>
            <p className={`text-sm font-medium ${product.stock > 0 ? "text-success" : "text-danger"}`}>{status}</p>
          </div>
          {preview ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-sm text-muted">Bản xem trước: nút mua hàng không hoạt động.</p>
          ) : (
            <PurchasePanel name={product.name} variants={product.variants.filter((v) => v.isActive)} />
          )}

          {linked.length > 0 && (
            <section aria-labelledby="hop-the" className="border-t border-line pt-6">
              <h2 id="hop-the" className="mb-3 text-lg font-semibold">
                {features?.members ? "Các thành viên hợp thể" : "Hợp thể thành"}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {linked.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/san-pham/${item.slug}`}
                      className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-4 pl-1 text-sm font-medium transition hover:border-brand hover:text-brand"
                    >
                      <ProductImage src={item.image} alt="" className="product-stage size-10 rounded-full" />
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="mo-ta" className="border-t border-line pt-6">
            <h2 id="mo-ta" className="mb-3 text-lg font-semibold">
              Chi tiết sản phẩm
            </h2>
            <div className="prose-store text-sm leading-relaxed whitespace-pre-line text-muted">{product.description}</div>
          </section>

          {product.specs.length > 0 && (
            <section aria-labelledby="thong-so" className="border-t border-line pt-6">
              <h2 id="thong-so" className="mb-3 text-lg font-semibold">
                Thông số
              </h2>
              <dl className="divide-y divide-line text-sm">
                {product.specs.map((spec) => (
                  <div key={spec.label} className="grid grid-cols-[9rem_1fr] gap-3 py-2.5">
                    <dt className="text-muted">{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {reviews && (
        <section id="danh-gia" aria-labelledby="danh-gia-tieu-de" className="space-y-4 border-t border-line pt-6">
          <h2 id="danh-gia-tieu-de" className="text-2xl font-semibold tracking-tight">
            Đánh giá {reviews.count > 0 && <span className="text-base font-normal text-muted">({reviews.average.toLocaleString("vi-VN")}/5 từ {reviews.count} đánh giá)</span>}
          </h2>
          {reviews.count === 0 ? (
            <p className="text-sm text-muted">Chưa có đánh giá nào. Khách đã mua có thể đánh giá trong trang tài khoản sau khi đơn hoàn tất.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {reviews.items.map((review) => (
                <li key={review.id} className="space-y-1 p-4 text-sm">
                  <p className="flex flex-wrap items-center gap-x-3">
                    <span className="text-warning" role="img" aria-label={`${review.rating} trên 5 sao`}>
                      {"★".repeat(review.rating)}
                      <span className="text-line">{"★".repeat(5 - review.rating)}</span>
                    </span>
                    <span className="font-medium">{review.userName}</span>
                    <span className="text-muted">{formatDate(review.createdAt)}</span>
                  </p>
                  {review.comment && <p className="whitespace-pre-line text-muted">{review.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="lien-quan" className="pt-6">
          <h2 id="lien-quan" className="mb-6 text-2xl font-semibold tracking-tight">
            Sản phẩm liên quan
          </h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
